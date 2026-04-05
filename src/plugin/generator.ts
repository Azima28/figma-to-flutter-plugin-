import { toPascalCase } from './utils';

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

export function generateFlutterCode(ast: any, indentLevel: number, logicNodes: any[] = [], logicEdges: any[] = []): string {
    let coreCode = generateWidgetCore(ast, indentLevel, logicNodes, logicEdges);

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
                    const closeOutside = nav.closeOutside !== false;

                    let alignment = 'Alignment.center';
                    if (posType === 'TOP_CENTER' || posType === 'TOP') alignment = 'Alignment.topCenter';
                    else if (posType === 'BOTTOM_CENTER' || posType === 'BOTTOM') alignment = 'Alignment.bottomCenter';
                    else if (posType === 'TOP_LEFT') alignment = 'Alignment.topLeft';
                    else if (posType === 'TOP_RIGHT') alignment = 'Alignment.topRight';
                    else if (posType === 'BOTTOM_LEFT') alignment = 'Alignment.bottomLeft';
                    else if (posType === 'BOTTOM_RIGHT') alignment = 'Alignment.bottomRight';
                    else if (posType === 'CENTER' || posType === "CENTERED") alignment = 'Alignment.center';

                    let overlayChild = `${destClassName}()`;
                    if (posType === 'MANUAL') {
                        overlayChild = `Stack(\n${nextIndent}        children: [\n${nextIndent}          Positioned(\n${nextIndent}            left: ${offset.x},\n${nextIndent}            top: ${offset.y},\n${nextIndent}            child: ${destClassName}(),\n${nextIndent}          ),\n${nextIndent}        ],\n${nextIndent}      )`;
                        alignment = 'Alignment.topLeft';
                    }

                    nativeNavCode += `${nextIndent}  showGeneralDialog(\n${nextIndent}    context: context,\n${nextIndent}    barrierDismissible: ${closeOutside},\n${nextIndent}    barrierLabel: '',\n${nextIndent}    barrierColor: Colors.black54,\n${nextIndent}    pageBuilder: (context, anim1, anim2) => Align(\n${nextIndent}      alignment: ${alignment},\n${nextIndent}      child: Material(color: Colors.transparent, child: ${overlayChild}),\n${nextIndent}    ),\n${nextIndent}  );\n`;
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

export function generateWidgetCore(ast: any, indentLevel: number, logicNodes: any[] = [], logicEdges: any[] = []): string {
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

        if (radius > 0) {
            let decoProps = [];
            if (colorVal) decoProps.push(`color: const Color(0xFF${colorVal})`);
            decoProps.push(`borderRadius: BorderRadius.circular(${radius})`);
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
                const itemCode = generateFlutterCode(templateChild, indentLevel + 2, logicNodes, logicEdges);
                const listName = ast.name.replace('>list_', '');
                
                return `${indent}SizedBox(\n${nextIndent}height: ${ast.properties.height || 200},\n${nextIndent}child: ListView.builder(\n${nextIndent}  itemCount: _${listName}Data.length,\n${nextIndent}  itemBuilder: (context, index) {\n${nextIndent}    // TODO (Backend): Bind data dari _${listName}Data[index] di sini\n${nextIndent}    return ${itemCode.trim()};\n${nextIndent}  },\n${nextIndent}),\n${indent})`;
            }

            if (ast.name && ast.name.toLowerCase().startsWith('>grid_')) {
                const templateChild = ast.children[0];
                const itemCode = generateFlutterCode(templateChild, indentLevel + 2, logicNodes, logicEdges);
                const gridName = ast.name.replace('>grid_', '');
                
                return `${indent}SizedBox(\n${nextIndent}height: ${ast.properties.height || 400},\n${nextIndent}child: GridView.builder(\n${nextIndent}  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(\n${nextIndent}    crossAxisCount: 2,\n${nextIndent}    childAspectRatio: 1.0,\n${nextIndent}    crossAxisSpacing: 10,\n${nextIndent}    mainAxisSpacing: 10,\n${nextIndent}  ),\n${nextIndent}  itemCount: _${gridName}Data.length,\n${nextIndent}  itemBuilder: (context, index) {\n${nextIndent}    // TODO (Backend): Bind data dari _${gridName}Data[index] di sini\n${nextIndent}    return ${itemCode.trim()};\n${nextIndent}  },\n${nextIndent}),\n${indent})`;
            }

            if (ast.widget === 'Container' && ast.children.length === 1) {
                let childContent = generateFlutterCode(ast.children[0], indentLevel + 1, logicNodes, logicEdges);
                containerProps.push(`child: ${childContent.trim()}`);
            } else {
                let childrenArr: string[] = [];
                ast.children.forEach((c: any, index: number) => {
                    let childCode = generateFlutterCode(c, indentLevel + 2, logicNodes, logicEdges);
                    
                    if (c.properties.layoutGrow === 1) {
                        childCode = `${nextIndent}Expanded(\n${nextIndent}  child: ${childCode.trim()},\n${nextIndent})`;
                    }

                    if (ast.widget === 'Stack' && c.properties.x !== undefined && c.properties.y !== undefined) {
                        const hConst = c.properties.constraints?.horizontal || 'MIN';
                        const vConst = c.properties.constraints?.vertical || 'MIN';

                        let positionProps = [];
                        let wrappedChild = childCode.trim();

                        // 🌐 Horizontal Liquid Positioning
                        if (hConst === 'MIN') positionProps.push(`left: ${c.properties.x}`);
                        else if (hConst === 'MAX') positionProps.push(`right: ${ast.properties.width - (c.properties.x + c.properties.width)}`);
                        else if (hConst === 'STRETCH') {
                          positionProps.push(`left: ${c.properties.x}`);
                          positionProps.push(`right: ${ast.properties.width - (c.properties.x + c.properties.width)}`);
                        } else if (hConst === 'CENTER') {
                          // Untuk Center di Stack, kita butuh fill agar Center() tahu batasnya
                          positionProps.push(`left: 0`);
                          positionProps.push(`right: 0`);
                          wrappedChild = `Center(child: ${wrappedChild})`;
                        }

                        // 🌐 Vertical Liquid Positioning
                        if (vConst === 'MIN') positionProps.push(`top: ${c.properties.y}`);
                        else if (vConst === 'MAX') positionProps.push(`bottom: ${ast.properties.height - (c.properties.y + c.properties.height)}`);
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
            return `${indent}SizedBox(\n${nextIndent}width: ${Math.round(ast.properties.width)},\n${nextIndent}child: ${textWidget.trim()},\n${indent})`;
        }

        return textWidget;
    } else if (ast.widget === 'SvgPicture') {
        let svgSafe = (ast.properties.svg || '').replace(/'/g, "\\'").replace(/\n/g, '').replace(/\r/g, '');
        let colorStr = '';
        if (ast.properties.color) {
            let rawHex = ast.properties.color.replace('#', '');
            colorStr = `,\n${nextIndent}colorFilter: const ColorFilter.mode(Color(0xFF${rawHex}), BlendMode.srcIn)`;
        }
        return `${indent}// Vector ID: ${ast.name}\n${indent}SvgPicture.string(\n${nextIndent}'''${svgSafe}''',\n${nextIndent}width: ${Math.round(ast.properties.width)},\n${nextIndent}height: ${Math.round(ast.properties.height)}${colorStr}\n${indent})`;
    } else if (ast.widget === 'Image') {
        return `${indent}Image.asset(\n${nextIndent}'assets/images/${ast.properties.imageName}.png',\n${nextIndent}width: ${Math.round(ast.properties.width)},\n${nextIndent}height: ${Math.round(ast.properties.height)},\n${nextIndent}fit: BoxFit.cover,\n${indent})`;
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
