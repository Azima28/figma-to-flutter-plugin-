import { toPascalCase } from './utils';

export interface ScreenSize {
    width: number;
    height: number;
}

export function buildActionComments(triggerNodeId: string, logicNodes: any[], logicEdges: any[], indent: string): string {
    let lines: string[] = [];
    let outgoing = logicEdges.filter((e: any) => e.source === triggerNodeId);

    for (let edge of outgoing) {
        let target = logicNodes.find((n: any) => n.id === edge.target);
        if (target) {
            lines.push(`${indent}// 🎯 Aksi: ${target.data.label}`);

            let subEdges = logicEdges.filter((se: any) => se.source === target.id);
            if (subEdges.length > 0) {
                for (let subEdge of subEdges) {
                    let subTarget = logicNodes.find((n: any) => n.id === subEdge.target);
                    let condition = subEdge.label ? `[${subEdge.label}]` : 'Lanjut';
                    if (subTarget) {
                        lines.push(`${indent}//    👉 Jika ${condition} -> Eksekusi: "${subTarget.data.label}"`);
                    }
                }
            }
        }
    }
    return lines.join('\n');
}

export function generateFlutterCode(ast: any, indentLevel: number, logicNodes: any[] = [], logicEdges: any[] = [], screenSize?: ScreenSize): string {
    // 🧩 MODULARITY V4.12: Shared Component Call Logic
    if (ast.isInstance && ast.mainComponentId) {
        const className = toPascalCase(ast.mainComponentName);
        const indent = '  '.repeat(indentLevel);
        const nextIndent = '  '.repeat(indentLevel + 1);

        let overridesCode = '';
        if (ast.overrides) {
            const textValue = Object.values(ast.overrides)[0] as string;
            if (textValue) {
                overridesCode = `\n${nextIndent}text: "${textValue.replace(/"/g, '\\"')}",`;
            }
        }

        const isBtn = (ast.name || '').toLowerCase().startsWith('>btn_');
        const triggerName = isBtn ? ast.name.substring(5) : ast.name;
        const matchingTrigger = logicNodes.find((ln: any) => ln.data.label === triggerName && ln.data.typeLabel === 'Batas: Tombol/Klik');
        const triggerId = matchingTrigger ? matchingTrigger.id : '';
        const actionComments = triggerId ? buildActionComments(triggerId, logicNodes, logicEdges, nextIndent + '  ') : '';

        let onTapCode = `\n${nextIndent}onTap: () {\n${nextIndent}  // 🎯 Layer: ${ast.name}${actionComments ? '\n' + actionComments : ''}\n${nextIndent}},`;

        return `${indent}${className}(${overridesCode}${onTapCode}\n${indent})`;
    }

    let coreCode = generateWidgetCore(ast, indentLevel, logicNodes, logicEdges, screenSize);

    let isBtnPrefix = (ast.name || '').toLowerCase().startsWith('>btn_');
    let triggerName = isBtnPrefix ? ast.name.substring(5) : ast.name;
    let matchingTrigger = logicNodes.find((ln: any) => ln.data.label === triggerName && ln.data.typeLabel === 'Batas: Tombol/Klik');

    let nativeNavs = ast.properties && ast.properties.figmaNavigations ? ast.properties.figmaNavigations : [];
    let hasNativeNav = nativeNavs.length > 0;

    let triggerId = matchingTrigger ? matchingTrigger.id : '';
    let hasLogicAction = triggerId ? logicEdges.some((e: any) => e.source === triggerId) : false;

    if (isBtnPrefix || hasNativeNav || hasLogicAction) {
        const indent = '  '.repeat(indentLevel);
        const nextIndent = '  '.repeat(indentLevel + 1);

        let actionComments = triggerId ? buildActionComments(triggerId, logicNodes, logicEdges, nextIndent + '  ') : '';
        let nativeNavCode = '';
        if (hasNativeNav) {
            nativeNavs.forEach((nav: any) => {
                let dest = typeof nav === 'string' ? nav : nav.dest;
                let originalName = typeof nav === 'string' ? dest : nav.originalName;
                let isOverlay = typeof nav === 'string' ? false : nav.isOverlay;

                if (isOverlay) {
                    let destClassName = toPascalCase(originalName) + 'Screen';
                    const posType = nav.overlayPosition || 'CENTER';
                    const offset = nav.overlayOffset || { x: 0, y: 0 };
                    const closeOutside = nav.closeOutside === true;
                    const hasBackground = nav.hasBackground === true;

                    let alignment = 'Alignment.center';
                    const mappedPos = posType.toUpperCase();
                    if (mappedPos.includes('TOP_CENTER') || mappedPos === 'TOP') alignment = 'Alignment.topCenter';
                    else if (mappedPos.includes('BOTTOM_CENTER') || mappedPos === 'BOTTOM') alignment = 'Alignment.bottomCenter';
                    else if (mappedPos.includes('TOP_LEFT')) alignment = 'Alignment.topLeft';
                    else if (mappedPos.includes('TOP_RIGHT')) alignment = 'Alignment.topRight';
                    else if (mappedPos.includes('BOTTOM_LEFT')) alignment = 'Alignment.bottomLeft';
                    else if (mappedPos.includes('BOTTOM_RIGHT')) alignment = 'Alignment.bottomRight';
                    else if (mappedPos.includes('LEFT_CENTER')) alignment = 'Alignment.centerLeft';
                    else if (mappedPos.includes('RIGHT_CENTER')) alignment = 'Alignment.centerRight';
                    else if (mappedPos.includes('CENTER')) alignment = 'Alignment.center';

                    const isManual = posType.toUpperCase().includes('MANUAL') || offset.x !== 0 || offset.y !== 0;
                    let innerContent = '';

                    if (isManual) {
                        const finalX = (nav.triggerX || 0) + offset.x;
                        const finalY = (nav.triggerY || 0) + offset.y;
                        innerContent = `Stack(\n${nextIndent}            fit: StackFit.expand,\n${nextIndent}            children: [\n${nextIndent}              Positioned(\n${nextIndent}                left: ${finalX},\n${nextIndent}                top: ${finalY},\n${nextIndent}                child: Material(color: Colors.transparent, child: const ${destClassName}()),\n${nextIndent}              ),\n${nextIndent}            ],\n${nextIndent}          )`;
                    } else {
                        innerContent = `Align(\n${nextIndent}            alignment: ${alignment},\n${nextIndent}            child: Material(color: Colors.transparent, child: const ${destClassName}()),\n${nextIndent}          )`;
                    }

                    nativeNavCode += `${nextIndent}  showGeneralDialog(\n${nextIndent}    context: context,\n${nextIndent}    barrierDismissible: true,\n${nextIndent}    barrierLabel: 'Dismiss',\n${nextIndent}    barrierColor: ${hasBackground ? 'Colors.black54' : 'Colors.transparent'},\n${nextIndent}    pageBuilder: (context, anim1, anim2) => PopScope(\n${nextIndent}      canPop: true,\n${nextIndent}      child: GestureDetector(\n${nextIndent}        behavior: HitTestBehavior.opaque,\n${nextIndent}        onTap: () { if (${closeOutside}) Navigator.pop(context); },\n${nextIndent}        child: Material(\n${nextIndent}          color: Colors.transparent,\n${nextIndent}          child: Center(\n${nextIndent}            child: FittedBox(\n${nextIndent}              fit: BoxFit.contain,\n${nextIndent}              child: SizedBox(\n${nextIndent}                width: ${screenSize?.width ?? 1440},\n${nextIndent}                height: ${screenSize?.height ?? 1024},\n${nextIndent}                child: Stack(\n${nextIndent}                  fit: StackFit.expand,\n${nextIndent}                  children: [\n${nextIndent}                    Positioned(\n${nextIndent}                      left: ${isManual ? ((nav.triggerX || 0) + offset.x) : 0},\n${nextIndent}                      top: ${isManual ? ((nav.triggerY || 0) + offset.y) : 0},\n${nextIndent}                      child: GestureDetector(\n${nextIndent}                        behavior: HitTestBehavior.opaque,\n${nextIndent}                        onTap: () {}, // Stop propagation to background\n${nextIndent}                        child: const ${destClassName}(),\n${nextIndent}                      ),\n${nextIndent}                    ),\n${nextIndent}                  ],\n${nextIndent}                ),\n${nextIndent}              ),\n${nextIndent}            ),\n${nextIndent}          ),\n${nextIndent}        ),\n${nextIndent}      ),\n${nextIndent}    ),\n${nextIndent}  );\n`;
                } else {
                    nativeNavCode += `${nextIndent}  Navigator.pushNamed(context, '/${dest}');\n`;
                }
            });
        }

        return `${indent}GestureDetector(
${nextIndent}onTap: () async {
${nextIndent}  // 🎨 SKELETON: Rangka ini siap dipoles dengan logic backend Anda!
${nextIndent}  // Layer Name: ${ast.name}
${nextIndent}  
${nextIndent}  // 🤖 LOGIC KONEKSI DARI NODE EDITOR:
${actionComments}
${nativeNavCode}
${nextIndent}  // TODO (Backend): Tambahkan pemolesan logic untuk ${triggerName} di sini.
${nextIndent}},
${nextIndent}child: ${coreCode.trim()},
${indent})`;
    }

    return coreCode;
}

export function generateWidgetCore(ast: any, indentLevel: number, logicNodes: any[] = [], logicEdges: any[] = [], screenSize?: ScreenSize): string {
    const indent = '  '.repeat(indentLevel);
    const nextIndent = '  '.repeat(indentLevel + 1);

    if (ast.widget === 'Container' || ast.widget === 'Row' || ast.widget === 'Column' || ast.widget === 'Stack') {
        let layoutProps = [];
        let containerProps = [];

        if (ast.properties.width && ast.widget !== 'Row' && ast.widget !== 'Column') containerProps.push(`width: ${ast.properties.width}`);
        if (ast.properties.height && ast.widget !== 'Row' && ast.widget !== 'Column') containerProps.push(`height: ${ast.properties.height}`);

        if (ast.properties.mainAxisAlignment && (ast.widget === 'Row' || ast.widget === 'Column')) {
            layoutProps.push(`mainAxisAlignment: MainAxisAlignment.${ast.properties.mainAxisAlignment}`);
        }
        if (ast.properties.crossAxisAlignment && (ast.widget === 'Row' || ast.widget === 'Column')) {
            layoutProps.push(`crossAxisAlignment: CrossAxisAlignment.${ast.properties.crossAxisAlignment}`);
        }

        let colorVal = (ast.properties.color || ast.properties.backgroundColor || '').replace('#', '');
        let radius = ast.properties.cornerRadius || 0;

        if (radius > 0 || ast.properties.stroke) {
            let decoProps = [];
            if (colorVal) decoProps.push(`color: const Color(0xFF${colorVal})`);
            if (ast.properties.stroke) {
                const s = ast.properties.stroke;
                const sw = s.weight || 1.0;
                const sc = (s.color || '000000').replace('#', '');
                decoProps.push(`border: Border.all(color: const Color(0xFF${sc}), width: ${sw})`);
            }
            if (radius > 0) decoProps.push(`borderRadius: BorderRadius.circular(${radius})`);
            containerProps.push(`decoration: BoxDecoration(\n${nextIndent}  ${decoProps.join(`,\n${nextIndent}  `)},\n${nextIndent})`);
        } else if (colorVal) {
            containerProps.push(`color: const Color(0xFF${colorVal})`);
        }

        if (ast.properties.padding) {
            let p = ast.properties.padding;
            if (p.top > 0 || p.bottom > 0 || p.left > 0 || p.right > 0) {
                if (p.top === p.bottom && p.left === p.right && p.top === p.left) {
                    containerProps.push(`padding: const EdgeInsets.all(${p.top})`);
                } else {
                    containerProps.push(`padding: const EdgeInsets.only(left: ${p.left}, top: ${p.top}, right: ${p.right}, bottom: ${p.bottom})`);
                }
            }
        }

        let childrenStr = '';
        let hasChildren = false;
        if (ast.children && ast.children.length > 0) {
            hasChildren = true;

            if (ast.name && ast.name.toLowerCase().startsWith('>list_')) {
                const templateChild = ast.children[0];
                const itemCode = generateFlutterCode(templateChild, indentLevel + 2, logicNodes, logicEdges, screenSize);
                const listName = ast.name.replace('>list_', '');
                
                return `${indent}SizedBox(\n${nextIndent}height: ${ast.properties.height || 200},\n${nextIndent}child: ListView.builder(\n${nextIndent}  itemCount: _${listName}Data.length,\n${nextIndent}  itemBuilder: (context, index) {\n${nextIndent}    // TODO (Backend): Bind data dari _${listName}Data[index] di sini\n${nextIndent}    return ${itemCode.trim()};\n${nextIndent}  },\n${nextIndent}),\n${indent})`;
            }

            if (ast.name && ast.name.toLowerCase().startsWith('>grid_')) {
                const templateChild = ast.children[0];
                const itemCode = generateFlutterCode(templateChild, indentLevel + 2, logicNodes, logicEdges, screenSize);
                const gridName = ast.name.replace('>grid_', '');
                
                return `${indent}SizedBox(\n${nextIndent}height: ${ast.properties.height || 400},\n${nextIndent}child: GridView.builder(\n${nextIndent}  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(\n${nextIndent}    crossAxisCount: 2,\n${nextIndent}    childAspectRatio: 1.0,\n${nextIndent}    crossAxisSpacing: 10,\n${nextIndent}    mainAxisSpacing: 10,\n${nextIndent}  ),\n${nextIndent}  itemCount: _${gridName}Data.length,\n${nextIndent}  itemBuilder: (context, index) {\n${nextIndent}    // TODO (Backend): Bind data dari _${gridName}Data[index] di sini\n${nextIndent}    return ${itemCode.trim()};\n${nextIndent}  },\n${nextIndent}),\n${indent})`;
            }

            if (ast.widget === 'Container' && ast.children.length === 1) {
                let childContent = generateFlutterCode(ast.children[0], indentLevel + 1, logicNodes, logicEdges, screenSize);
                containerProps.push(`child: ${childContent.trim()}`);
            } else {
                let childrenArr: string[] = [];
                ast.children.forEach((c: any, index: number) => {
                    let childCode = generateFlutterCode(c, indentLevel + 2, logicNodes, logicEdges, screenSize);
                    
                    if (c.properties.layoutGrow === 1) {
                        childCode = `${nextIndent}Expanded(\n${nextIndent}  child: ${childCode.trim()},\n${nextIndent})`;
                    }

                    if (ast.widget === 'Stack' && c.properties.x !== undefined && c.properties.y !== undefined) {
                        const hConst = c.properties.constraints?.horizontal || 'MIN';
                        const vConst = c.properties.constraints?.vertical || 'MIN';

                        let positionProps = [];
                        let wrappedChild = childCode.trim();

                        // 🌐 Horizontal Liquid Positioning
                        if (hConst === 'MIN') {
                            positionProps.push(`left: ${c.properties.x}`);
                            if (c.properties.width) positionProps.push(`width: ${parseFloat(c.properties.width.toFixed(2))}`);
                        }
                        else if (hConst === 'MAX') {
                            positionProps.push(`right: ${ast.properties.width - (c.properties.x + c.properties.width)}`);
                            if (c.properties.width) positionProps.push(`width: ${parseFloat(c.properties.width.toFixed(2))}`);
                        }
                        else if (hConst === 'STRETCH') {
                          positionProps.push(`left: ${c.properties.x}`);
                          positionProps.push(`right: ${ast.properties.width - (c.properties.x + c.properties.width)}`);
                        } else if (hConst === 'CENTER') {
                          positionProps.push(`left: 0`);
                          positionProps.push(`right: 0`);
                          wrappedChild = `Center(child: ${wrappedChild})`;
                        }

                        // 🌐 Vertical Liquid Positioning
                        if (vConst === 'MIN') {
                            positionProps.push(`top: ${c.properties.y}`);
                            if (c.properties.height && c.properties.height > 2) positionProps.push(`height: ${parseFloat(c.properties.height.toFixed(2))}`);
                        }
                        else if (vConst === 'MAX') {
                            positionProps.push(`bottom: ${ast.properties.height - (c.properties.y + c.properties.height)}`);
                            if (c.properties.height && c.properties.height > 2) positionProps.push(`height: ${parseFloat(c.properties.height.toFixed(2))}`);
                        }
                        else if (vConst === 'STRETCH') {
                          positionProps.push(`top: ${c.properties.y}`);
                          positionProps.push(`bottom: ${ast.properties.height - (c.properties.y + c.properties.height)}`);
                        } else if (vConst === 'CENTER') {
                          positionProps.push(`top: 0`);
                          positionProps.push(`bottom: 0`);
                          wrappedChild = `Center(child: ${wrappedChild})`;
                        }

                        if (positionProps.length > 0) {
                          childrenArr.push(`${nextIndent}Positioned(\n${nextIndent}  ${positionProps.join(`,\n${nextIndent}  `)},\n${nextIndent}  child: ${wrappedChild},\n${nextIndent})`);
                        } else {
                          childrenArr.push(wrappedChild);
                        }
                    } else {
                        childrenArr.push(childCode);
                    }

                    // Tambahkan Spacing (Gap) jika ada
                    const isLast = index === ast.children.length - 1;
                    if (!isLast && ast.properties.itemSpacing > 0 && ast.widget !== 'Stack') {
                        const axis = ast.widget === 'Row' ? 'width' : 'height';
                        childrenArr.push(`${nextIndent}const SizedBox(${axis}: ${ast.properties.itemSpacing})`);
                    }
                });
                childrenStr = `children: [\n${childrenArr.join(',\n')}\n${nextIndent}]`;
                layoutProps.push(childrenStr);
            }
        }

        let finalWidgetString = '';
        if (ast.widget === 'Container' && !hasChildren) {
            finalWidgetString = `${indent}Container(\n${nextIndent}${containerProps.join(`,\n${nextIndent}`)}\n${indent})`;
        } else if (ast.widget === 'Container' && hasChildren && ast.children.length === 1) {
            finalWidgetString = `${indent}Container(\n${nextIndent}${containerProps.join(`,\n${nextIndent}`)}\n${indent})`;
        } else {
            let actualWidget = ast.widget === 'Container' ? 'Stack' : ast.widget;
            let layoutString = '';
            if (layoutProps.length > 0) {
                layoutString = `${actualWidget}(\n${nextIndent}${layoutProps.join(`,\n${nextIndent}`)}\n${indent})`;
            } else {
                layoutString = `${actualWidget}()`;
            }

            if (containerProps.length > 0) {
                containerProps.push(`child: ${layoutString.trim()}`);
                finalWidgetString = `${indent}Container(\n${nextIndent}${containerProps.join(`,\n${nextIndent}`)}\n${indent})`;
            } else {
                finalWidgetString = `${indent}${layoutString}`;
            }
        }
        return finalWidgetString;

    } else if (ast.widget === 'Text') {
        let textStr = (ast.properties.text || '').replace(/\n/g, '\\n').replace(/'/g, "\\'");
        let styleProps = [];
        if (ast.properties.fontSize) styleProps.push(`fontSize: ${ast.properties.fontSize}`);
        if (ast.properties.color) {
            let rawHex = ast.properties.color.replace('#', '');
            styleProps.push(`color: const Color(0xFF${rawHex})`);
        }

        let styleStr = '';
        if (styleProps.length > 0) {
            styleStr = `,\n${nextIndent}style: const TextStyle(\n${nextIndent}  ${styleProps.join(`,\n${nextIndent}  `)}\n${nextIndent})`;
        }

        let alignStr = '';
        if (ast.properties.textAlign === 'CENTER') alignStr = `,\n${nextIndent}textAlign: TextAlign.center`;
        else if (ast.properties.textAlign === 'RIGHT') alignStr = `,\n${nextIndent}textAlign: TextAlign.right`;
        else if (ast.properties.textAlign === 'JUSTIFIED') alignStr = `,\n${nextIndent}textAlign: TextAlign.justify`;

        let textWidget = `${indent}Text(\n${nextIndent}'${textStr}'${styleStr}${alignStr}\n${indent})`;

        if (ast.properties.textAutoResize !== 'WIDTH_AND_HEIGHT' && ast.properties.width) {
            return `${indent}SizedBox(\n${nextIndent}width: ${parseFloat(ast.properties.width.toFixed(2))},\n${nextIndent}child: ${textWidget.trim()},\n${indent})`;
        }
        return textWidget;
    } else if (ast.widget === 'SvgPicture') {
        let svgString = (ast.properties.svg || '');
        
        // 🧩 MODULARITY V4.26: Stable Direct Painting
        // 1. Bersihkan atribut bawaan Figma yang sering bikin 'blink' atau transparan
        svgString = svgString.replace(/width="[^"]*"/gi, '');
        svgString = svgString.replace(/height="[^"]*"/gi, '');
        svgString = svgString.replace(/stroke="[^"]*"/gi, ' ');
        svgString = svgString.replace(/stroke-width="[^"]*"/gi, ' ');
        svgString = svgString.replace(/fill="[^"]*"/gi, ' ');
        svgString = svgString.replace(/overflow="[^"]*"/gi, ' ');

        // 2. Tentukan Warna (Injeksi Langsung)
        const hasStroke = !!(ast.properties.stroke && ast.properties.stroke.weight);
        const prefColor = (hasStroke ? ast.properties.stroke.color : ast.properties.color) || '#000000';
        const hexPaint = prefColor.startsWith('#') ? prefColor : `#${prefColor}`;
        
        // 3. Rakit atribut baru dengan Fill-Rule 'evenodd' (Standar Figma)
        const weight = hasStroke ? Math.max(ast.properties.stroke.weight, 1.5) : 1.5;
        let shapeAttrs = `stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd"`;
        
        if (hasStroke) {
            shapeAttrs += ` stroke="${hexPaint}" stroke-width="${weight}" fill="none"`;
        } else {
            shapeAttrs += ` fill="${hexPaint}"`;
        }
        
        const shapeRegex = /<(path|line|rect|circle|ellipse|polygon|polyline)/gi;
        svgString = svgString.replace(shapeRegex, (match: string) => `${match} ${shapeAttrs} `);

        let svgSafe = svgString.replace(/'/g, "\\'").replace(/\n/g, '').replace(/\r/g, '');
        
        const wVal = parseFloat(ast.properties.width.toFixed(2));
        const hVal = ast.properties.height <= 2.0 ? wVal : parseFloat(ast.properties.height.toFixed(2));

        // 🧩 V4.50: Use per-screen SVG constant if pre-processed
        if (ast.properties.svgRefName) {
            const constName = '_kSvg' + ast.properties.svgRefName.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
            return `${indent}SvgPicture.string(\n${nextIndent}${constName},\n${nextIndent}width: ${wVal},\n${nextIndent}height: ${hVal},\n${nextIndent}fit: BoxFit.contain\n${indent})`;
        }

        return `${indent}SvgPicture.string(\n${nextIndent}'''${svgSafe}''',\n${nextIndent}width: ${wVal},\n${nextIndent}height: ${hVal},\n${nextIndent}fit: BoxFit.contain\n${indent})`;
    } else if (ast.widget === 'Image') {
        return `${indent}Image.asset(\n${nextIndent}'assets/images/${ast.properties.imageName}.png',\n${nextIndent}width: ${parseFloat(ast.properties.width.toFixed(2))},\n${nextIndent}height: ${parseFloat(ast.properties.height.toFixed(2))},\n${nextIndent}fit: BoxFit.cover,\n${indent})`;
    } else if (ast.widget === 'TextField') {
        const inputName = ast.name.substring(7);
        return `${indent}Padding(\n${nextIndent}padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),\n${nextIndent}child: TextFormField(\n${nextIndent}  controller: _${inputName}Controller,\n${nextIndent}  decoration: InputDecoration(\n${nextIndent}    labelText: '${inputName}',\n${nextIndent}    hintText: 'Ketuk untuk mengisi ${inputName}...',\n${nextIndent}    border: const OutlineInputBorder(),\n${nextIndent}  ),\n${nextIndent}),\n${indent})`;
    } else if (ast.widget === 'Divider') {
        return `${indent}const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE))`;
    } else if (ast.widget === 'AppBar') {
        let title = ast.name.replace('>appbar_', '');
        return `${indent}AppBar(\n${nextIndent}title: Text('${title}'),\n${nextIndent}centerTitle: true,\n${nextIndent}backgroundColor: ${ast.properties.backgroundColor ? `Color(${ast.properties.backgroundColor.replace('#', '0xFF')})` : 'Colors.white'},\n${nextIndent}elevation: 1,\n${indent})`;
    } else if (ast.widget === 'BottomNavigationBar') {
        return `${indent}BottomNavigationBar(\n${nextIndent}items: const [\n${nextIndent}  BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),\n${nextIndent}  BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),\n${nextIndent}],\n${indent})`;
    }
    return `${indent}SizedBox() /* Unsupported widget: ${ast.widget} */`;
}
