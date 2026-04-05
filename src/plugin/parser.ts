import { extractFills } from './utils';

export async function parseNode(node: SceneNode): Promise<any> {
    const nodeNameLower = node.name.toLowerCase();

    // Fitur Rahasia (Animasi Smart Shortcut)
    if (nodeNameLower.includes('loading') || nodeNameLower.includes('spinner') || nodeNameLower.includes('anim')) {
        return {
            widget: 'LoadingIndicator',
            name: node.name,
            properties: {
                width: node.width,
                height: node.height,
                x: node.x,
                y: node.y,
            }
        };
    }

    let astNode: any = null;

    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP') {
        astNode = await parseFrameShape(node as any);
    } else if (node.type === 'TEXT') {
        astNode = parseTextShape(node);
    } else if (node.type === 'RECTANGLE') {
        astNode = parseRectangleShape(node);
    } else if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'LINE') {
        astNode = await parseVectorShape(node);
    }

    if (!astNode) {
        astNode = {
            widget: 'Unsupported_Widget',
            figmaType: node.type,
            name: node.name,
            properties: {}
        };
    }

    astNode.figmaNodeId = node.id;
    astNode.name = node.name;

    if ('reactions' in node) {
        let navDestinations: any[] = [];
        for (let r of node.reactions) {
            if (r.trigger?.type === 'ON_CLICK' && r.action?.type === 'NODE' && r.action.destinationId) {
                let destNode = figma.getNodeById(r.action.destinationId);
                if (destNode) {
                    let cleanDestName = destNode.name.toLowerCase().replace(/[^a-z0-9\/]/g, '_');
                    cleanDestName = cleanDestName.replace(/^\/+|\/+$/g, '');

                    if (!cleanDestName.includes('/')) cleanDestName = `export/${cleanDestName}`;
                    let action = r.action as any;
                    let isOverlay = action.navigation === 'OVERLAY';
                    // Deteksi posisi dengan berbagai kemungkinan nama properti API Figma
                    let overlayPos = action.overlayPositionType || action.overlayPosition || (action.overlayRelativePosition ? 'MANUAL' : 'CENTER');
                    let overlayOffset = { x: 0, y: 0 };
                    if (action.overlayRelativePosition) {
                        overlayOffset = { x: action.overlayRelativePosition.x ?? 0, y: action.overlayRelativePosition.y ?? 0 };
                    } else if (action.overlayRelativeOffset) {
                        overlayOffset = { x: action.overlayRelativeOffset.x ?? 0, y: action.overlayRelativeOffset.y ?? 0 };
                    } else if (action.overlayOffset) {
                        overlayOffset = { x: action.overlayOffset.x ?? 0, y: action.overlayOffset.y ?? 0 };
                    }
                    let closeOutside = action.overlayBackgroundInteraction === 'CLOSE_ON_CLICK_OUTSIDE';

                    navDestinations.push({
                        dest: cleanDestName,
                        originalName: destNode.name,
                        isOverlay: isOverlay,
                        overlayPosition: overlayPos,
                        overlayOffset: overlayOffset,
                        closeOutside: closeOutside
                    });
                }
            }
        }
        if (navDestinations.length > 0) {
            if (!astNode.properties) astNode.properties = {};
            astNode.properties.figmaNavigations = navDestinations;
        }
    }

    if ('constraints' in node) {
        if (!astNode.properties) astNode.properties = {};
        astNode.properties.constraints = node.constraints;
    }

    return astNode;
}

export async function parseVectorShape(node: any): Promise<any> {
    let svgString = '';
    try {
        const bytes = await node.exportAsync({ format: 'SVG' });
        svgString = String.fromCharCode.apply(null, Array.from(bytes));
    } catch (e) {
        console.error("Gagal mengekstrak SVG", e);
    }

    return {
        widget: 'SvgPicture',
        name: node.name,
        properties: {
            width: node.width,
            height: node.height,
            x: node.x,
            y: node.y,
            svg: svgString,
            color: extractFills(node.fills)
        }
    };
}

export async function parseFrameShape(node: any): Promise<any> {
    let flutterWidget = 'Container';
    let children = [];

    if ('children' in node) {
        children = await Promise.all(node.children.map((c: SceneNode) => parseNode(c)));
        
        // PERBAIKAN V4.9: Normalisasi Koordinat Group (Figma Group Paradox Fix)
        // Groups di Figma tidak mendefinisikan coordinate system baru untuk anaknya.
        // Jadi kita harus menggeser posisi anak-anaknya agar relatif terhadap Group.
        if (node.type === 'GROUP') {
            children.forEach(childAst => {
                if (childAst.properties && childAst.properties.x !== undefined) {
                    childAst.properties.x = childAst.properties.x - node.x;
                }
                if (childAst.properties && childAst.properties.y !== undefined) {
                    childAst.properties.y = childAst.properties.y - node.y;
                }
            });
        }
    }

    if (node.layoutMode === 'HORIZONTAL') {
        flutterWidget = 'Row';
    } else if (node.layoutMode === 'VERTICAL') {
        flutterWidget = 'Column';
    } else if (children.length > 0) {
        // PERBAIKAN V4.5: Selalu gunakan Stack jika bukan Auto Layout 
        // dan punya anak, agar koordinat X/Y tidak hilang (Top-Left Bug Fix).
        flutterWidget = 'Stack';
    }

    const alignMap: any = { 'MIN': 'start', 'CENTER': 'center', 'MAX': 'end', 'SPACE_BETWEEN': 'spaceBetween' };
    const crossAlignMap: any = { 'MIN': 'start', 'CENTER': 'center', 'MAX': 'end', 'BASELINE': 'baseline' };

    let widgetType = flutterWidget;
    const lowerName = node.name.toLowerCase();
    if (lowerName.startsWith('>appbar_')) widgetType = 'AppBar';
    else if (lowerName.startsWith('>bottom_nav_')) widgetType = 'BottomNavigationBar';

    return {
        widget: widgetType,
        name: node.name,
        properties: {
            width: node.width,
            height: node.height,
            x: node.x,
            y: node.y,
            padding: {
                top: node.paddingTop || 0,
                bottom: node.paddingBottom || 0,
                left: node.paddingLeft || 0,
                right: node.paddingRight || 0
            },
            itemSpacing: node.itemSpacing || 0,
            mainAxisAlignment: alignMap[node.primaryAxisAlignItems] || 'start',
            crossAxisAlignment: crossAlignMap[node.counterAxisAlignItems] || 'start',
            layoutGrow: node.layoutGrow || 0,
            cornerRadius: node.cornerRadius || 0,
            backgroundColor: extractFills(node.fills),
            layoutMode: node.layoutMode || 'NONE' // 👈 Tambahkan info layout mode
        },
        children: children
    };
}

export function parseTextShape(node: TextNode): any {
    return {
        widget: 'Text',
        name: node.name,
        properties: {
            text: node.characters,
            x: node.x,
            y: node.y,
            width: node.width,
            textAutoResize: node.textAutoResize,
            fontSize: node.fontSize,
            fontName: node.fontName,
            color: extractFills(node.fills),
            textAlign: node.textAlignHorizontal
        }
    };
}

export function parseRectangleShape(node: RectangleNode): any {
    const fills = extractFills(node.fills);
    let widgetType = 'Container';
    let extraProps: any = {};

    if (node.name.toLowerCase().startsWith('>input_')) {
        widgetType = 'TextField';
    } else if (node.name.toLowerCase().startsWith('>divider_') || (node.height <= 2 && node.width > node.height * 10)) {
        widgetType = 'Divider';
    } else if (fills && typeof fills === 'object' && fills.type === 'IMAGE') {
        widgetType = 'Image';
        const cleanName = node.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        extraProps.imageName = `img_${cleanName}_${fills.hash.substring(0, 5)}`;
    }

    return {
        widget: widgetType,
        name: node.name,
        properties: {
            width: node.width,
            height: node.height,
            x: node.x,
            y: node.y,
            cornerRadius: node.cornerRadius,
            color: typeof fills === 'string' ? fills : null,
            ...extraProps
        }
    };
}
