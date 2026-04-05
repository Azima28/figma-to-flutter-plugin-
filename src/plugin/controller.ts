import { toPascalCase, extractFills } from './utils';
import { parseNode } from './parser';
import { generateFlutterCode } from './generator';

figma.showUI(__html__, { width: 450, height: 650 });

// Muat konfigurasi tersimpan
figma.clientStorage.getAsync('figmaFlutterConfig').then(config => {
    figma.ui.postMessage({ type: 'load-config', config });
});

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'save-config') {
        await figma.clientStorage.setAsync('figmaFlutterConfig', msg.config);
    }

    if (msg.type === 'generate') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.notify('Please select a frame first.');
            return;
        }

        figma.notify(`Parsing ${selection.length} node(s) to Flutter AST...`);

        const nodeASTs = await Promise.all(selection.map(node => parseNode(node)));

        let logicNodes = msg.logicNodes || [];
        let logicEdges = msg.logicEdges || [];
        let projectName = msg.projectName || 'figma_flutter_app';

        // 1. Extract Theme Colors from Figma Local Styles
        const localColors = figma.getLocalPaintStyles();
        let colorPalette: any = {};
        localColors.forEach(style => {
            const hex = extractFills(style.paints);
            if (typeof hex === 'string') {
                const safeName = style.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                colorPalette[safeName] = hex.replace('#', '0xFF');
            }
        });

        let colorConstants = Object.entries(colorPalette).map(([name, hex]) => {
            return `  static const Color ${name} = Color(${hex});`;
        }).join('\n');

        // 2. Generate Dart Code for Screens
        const screenClassSnippets: string[] = [];
        const registeredClassNames = new Set<string>(); // Zero-Bug: Sinkronisasi rute & class
        const globalImports = new Set<string>();
        globalImports.add("import 'package:flutter/material.dart';");
        globalImports.add("import 'package:flutter_svg/flutter_svg.dart';");
        globalImports.add("import 'package:google_fonts/google_fonts.dart';");

        let mainFiles = nodeASTs.map(ast => {
            const currentScreenImports = new Set<string>();
            currentScreenImports.add("import 'package:flutter/material.dart';");
            currentScreenImports.add("import 'package:flutter_svg/flutter_svg.dart';");
            currentScreenImports.add("import 'package:google_fonts/google_fonts.dart';");

            let inputNodes: any[] = [];
            let listNodes: any[] = [];
            const collectInputs = (node: any) => {
                if (node.widget === 'TextField') inputNodes.push(node);
                if (node.name && node.name.toLowerCase().startsWith('>list_')) listNodes.push(node);
                if (node.children) node.children.forEach(collectInputs);
            };
            collectInputs(ast);

            let controllers = inputNodes.map(input => {
                const name = input.name.substring(7);
                return `  final TextEditingController _${name}Controller = TextEditingController();`;
            }).join('\n');

            let mockData = listNodes.map(list => {
                const name = list.name.replace('>list_', '').replace('>grid_', '');
                return `  final List<String> _${name}Data = List.generate(10, (index) => "Item #$index");`;
            }).join('\n');

            let disposeControllers = inputNodes.map(input => {
                const name = input.name.substring(7);
                return `    _${name}Controller.dispose();`;
            }).join('\n');

            let mainBodyAST = JSON.parse(JSON.stringify(ast));
            let appBarAST = null;
            let bottomNavAST = null;

            if (mainBodyAST.children) {
                // Cari AppBar dan BottomNav di level pertama (Direct children of Frame Utama)
                const appBarIndex = mainBodyAST.children.findIndex((c: any) => c.widget === 'AppBar');
                if (appBarIndex !== -1) {
                    appBarAST = mainBodyAST.children.splice(appBarIndex, 1)[0];
                }
                const bottomNavIndex = mainBodyAST.children.findIndex((c: any) => c.widget === 'BottomNavigationBar');
                if (bottomNavIndex !== -1) {
                    bottomNavAST = mainBodyAST.children.splice(bottomNavIndex, 1)[0];
                }
            }

            let appBarCode = appBarAST ? generateFlutterCode(appBarAST, 3, logicNodes, logicEdges) : '';
            if (appBarCode) {
                // Wrap in PreferredSize for custom AppBars from Figma
                appBarCode = `      appBar: PreferredSize(\n        preferredSize: const Size.fromHeight(60.0),\n        child: ${appBarCode.trim()},\n      ),`;
            }

            let bottomNavCode = bottomNavAST ? generateFlutterCode(bottomNavAST, 3, logicNodes, logicEdges) : '';
            if (bottomNavCode) {
                bottomNavCode = `      bottomNavigationBar: ${bottomNavCode.trim()},`;
            }

            let widgetTreeCode = generateFlutterCode(mainBodyAST, 3, logicNodes, logicEdges);

            let cleanPath = ast.name.toLowerCase().replace(/[^a-z0-9\/]/g, '_');
            cleanPath = cleanPath.replace(/^\/+|\/+$/g, ''); 
            
            let finalPath = `lib/${cleanPath}.dart`;

            let className = toPascalCase(ast.name) + 'Screen';
            registeredClassNames.add(className);

            const frameWidth = ast.properties.width || 1440;
            const frameHeight = ast.properties.height || 1024;
            const shouldScroll = ast.name.toLowerCase().includes('scroll');
            const isOverlay = ast.name.toLowerCase().includes('overlay');

            let effectiveFrameHeight = frameHeight;
            if (appBarAST) effectiveFrameHeight -= 60;
            if (bottomNavAST) effectiveFrameHeight -= 60;

            let bodyWidget = widgetTreeCode.trim();
            if (shouldScroll) {
                bodyWidget = `SingleChildScrollView(
          child: Center(
            child: FittedBox(
              alignment: Alignment.topCenter,
              fit: BoxFit.scaleDown,
              child: SizedBox(
                width: ${frameWidth},
                height: ${effectiveFrameHeight},
                child: ${bodyWidget}
              ),
            ),
          ),
        )`;
            } else {
                bodyWidget = `Center(
          child: FittedBox(
            alignment: Alignment.center,
            fit: ${isOverlay ? 'BoxFit.scaleDown' : 'BoxFit.contain'}, // 🪄 LIQUID: Seimbangkan kaku vs fleksibel
            child: SizedBox(
              width: ${frameWidth},
              height: ${effectiveFrameHeight},
              child: ${bodyWidget}
            ),
          ),
        )`;
            }

            let rawBg = (ast.properties.backgroundColor || '').replace('#', '');
            let scaffoldBg = rawBg ? `const Color(0xFF${rawBg})` : 'Colors.white';

            // 🧩 DEPENDENCY ENGINE (V4.26)
            const findDependencies = (node: any, deps: Set<string>) => {
              if (node.properties && node.properties.figmaNavigations) {
                node.properties.figmaNavigations.forEach((r: any) => {
                  if (r.originalName) deps.add(r.originalName);
                });
              }
              if (node.children) {
                node.children.forEach((c: any) => findDependencies(c, deps));
              }
            };
            
            const dependencies = new Set<string>();
            findDependencies(ast, dependencies);
            
            dependencies.forEach(dest => {
              if (dest !== ast.name) {
                const cleanDest = dest.toLowerCase().replace(/[^a-z0-9\/]/g, '_').replace(/^\/+|\/+$/g, '');
                const importPath = `import 'package:${projectName}/${cleanDest}.dart';`;
                globalImports.add(importPath);
                currentScreenImports.add(importPath);
              }
            });

            let buildMethodContent = '';
            if (ast.name.toLowerCase().includes('overlay')) {
                buildMethodContent = `  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(child: ${bodyWidget}),
    );
  }`;
            } else {
                buildMethodContent = `  @override
  Widget build(BuildContext context) {
    return Scaffold(
${appBarCode}
      backgroundColor: ${scaffoldBg},
      body: ${bodyWidget},
${bottomNavCode}
    );
  }`;
            }

            let classCode = `class ${className} extends StatefulWidget {
  const ${className}({super.key});

  @override
  State<${className}> createState() => _${className}State();
}

class _${className}State extends State<${className}> {
${controllers}
${mockData}

  @override
  void dispose() {
${disposeControllers}
    super.dispose();
  }

${buildMethodContent}
}`;
            screenClassSnippets.push(classCode);

            return {
                path: finalPath,
                content: Array.from(currentScreenImports).join('\n') + '\n\n' + classCode
            };
        });

        const finalImports = Array.from(globalImports).join('\n');

        // 3. Generate main.dart routes map
        mainFiles
            .filter(f => f.path !== 'lib/main.dart')
            .forEach(f => {
                globalImports.add(`import 'package:${projectName}/${f.path.replace('lib/', '').replace('.dart', '')}.dart';`);
            });

        const routeMapEntries = nodeASTs.map((ast, index) => {
            const className = toPascalCase(ast.name) + 'Screen';
            
            // Cek apakah class ini ada dalam bundle saat ini (Anti-Bug: Linkage Check)
            if (!registeredClassNames.has(className)) return null;

            const cleanPath = ast.name.toLowerCase().replace(/[^a-z0-9\/]/g, '_').replace(/^\/+|\/+$/g, '');
            return `        '/${cleanPath}': (context) => const ${className}(),`;
        }).filter(r => r !== null).join('\n');

        // 🎨 MASTER MODE: Hanya sertakan import inti (Material, Svg, Fonts)
        // Ditempatkan di baris paling atas untuk menghindari error sintaksis Dart.
        const masterOnlyImports = new Set<string>();
        masterOnlyImports.add("import 'dart:io';");
        masterOnlyImports.add("import 'package:flutter/material.dart';");
        masterOnlyImports.add("import 'package:flutter_svg/flutter_svg.dart';");
        masterOnlyImports.add("import 'package:google_fonts/google_fonts.dart';");
        masterOnlyImports.add("import 'package:window_manager/window_manager.dart';");

        const initialRoutePath = mainFiles[0].path.replace('lib/', '').replace('.dart', '');
        const fWidth = nodeASTs[0].properties.width || 1440;
        const fHeight = nodeASTs[0].properties.height || 1024;

        const mainDartContent = `
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // 🪟 WINDOW MANAGER: Smart Scaling (Anti-Raksasa)
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    await windowManager.ensureInitialized();
    
    // Konfigurasi Figma Design
    const double fWidth = ${fWidth}.0;
    const double fHeight = ${fHeight}.0;
    const double maxWidth = 1200.0; // Lebar maks
    const double maxHeight = 800.0; // Tinggi maks (agar tidak mentok taskbar)
    
    double scaleW = fWidth > maxWidth ? maxWidth / fWidth : 1.0;
    double scaleH = fHeight > maxHeight ? maxHeight / fHeight : 1.0;
    double scale = scaleW < scaleH ? scaleW : scaleH; // Pilih skala terkecil agar muat dua-duanya

    WindowOptions windowOptions = WindowOptions(
      size: Size(fWidth * scale, fHeight * scale),
      center: true,
      title: "Figma Design Preview (Scale: \${(scale * 100).round()}%)",
    );
    
    windowManager.waitUntilReadyToShow(windowOptions, () async {
      await windowManager.show();
      await windowManager.focus();
    });
  }

  runApp(const MyApp());
}

class AppColors {
${colorConstants || '  // No Figma Local Styles found.'}
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Figma to Flutter V4',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: ${Object.keys(colorPalette).length > 0 ? `AppColors.${Object.keys(colorPalette)[0]}` : 'Colors.deepPurple'},
        ),
        useMaterial3: true,
      ),
      initialRoute: '/${initialRoutePath}',
      routes: {
${routeMapEntries}
      },
    );
  }
}
`;

        // 🧠 MASTER COPY (V4.44 Zero-Mistake Assembly): 
        // Menggabungkan SEMUA (Import Inti + main() + Semua Class) ke dalam tab utama.
        // Urutan: TOP IMPORTS -> MAIN/MYAPP -> ALL SCREEN CLASSES.
        const masterImportsHeader = Array.from(masterOnlyImports).join('\n');
        const allScreensContent = screenClassSnippets.join('\n\n');
        const dartCodeOutput = masterImportsHeader + '\n' + mainDartContent + '\n' + allScreensContent;

        // 4. pubspec.yaml & Assets (V4.11)
        let binaryAssets: { name: string, data: Uint8Array }[] = [];
        async function processNodeASTs(nodes: any[], assets: any[]) {
            for (let astNode of nodes) {
                if (astNode.widget === 'Image' && astNode.figmaNodeId) {
                    const node = figma.getNodeById(astNode.figmaNodeId) as SceneNode;
                    if (node) {
                        try {
                            const bytes = await node.exportAsync({ format: 'PNG' });
                            assets.push({ name: `${astNode.properties.imageName}.png`, data: bytes });
                        } catch (e) {
                            console.error("Gagal export image", e);
                        }
                    }
                }
                if (astNode.children) await processNodeASTs(astNode.children, assets);
            }
        }
        await processNodeASTs(nodeASTs, binaryAssets);

        let assetsEntry = '';
        if (binaryAssets.length > 0) {
            assetsEntry = `\n  assets:\n    - assets/images/`;
        }

        const pubspecContent = `name: ${projectName}
description: "A new Flutter project generated from Figma (The Living Ecosystem V4)"
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_svg: ^2.0.10+1
  google_fonts: ^6.1.0
  window_manager: ^0.3.7 # 👈 Added for Desktop Window Management

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1

flutter:
  uses-material-design: true${assetsEntry}`;

        // 5. Unified main.dart Packaging (V4.11)
        let finalFiles: { path: string, content: string }[] = [];
        finalFiles.push({ path: '[Boilerplate] pubspec.yaml', content: pubspecContent });
        finalFiles.push({ path: 'lib/main.dart', content: dartCodeOutput });

        // Tambahkan file screen lainnya ke dalam daftar (Filter lib/main.dart agar tidak dobel)
        mainFiles.forEach(f => {
            if (f.path !== 'lib/main.dart') {
                finalFiles.push({
                  path: f.path,
                  content: finalImports + '\n\n' + f.content.substring(f.content.indexOf('class '))
                });
            }
        });

        // finalFiles sudah diisi di atas (Langkah 4-5)

        // 6. Scrape Logic Nodes for UI
        let scrapedNodes: any[] = [];
        let frameNames: string[] = [];
        nodeASTs.forEach(ast => {
            frameNames.push(ast.name || 'Unknown Frame');
            extractScrapedNodes(ast, scrapedNodes, ast.name || 'Unknown Frame');
        });

        figma.ui.postMessage({
            type: 'ast-generated',
            ast: nodeASTs,
            dartCode: dartCodeOutput.trim(),
            files: finalFiles,
            binaryAssets,
            scrapedNodes,
            frameNames,
            colorPalette
        });
    }
};

function extractScrapedNodes(ast: any, scrapedNodes: any[], frameName: string) {
    if (ast && ast.name) {
        const lowerName = ast.name.toLowerCase();
        if (lowerName.startsWith('>btn_')) {
            scrapedNodes.push({ type: 'trigger', name: ast.name.substring(5), frame: frameName });
        } else if (lowerName.startsWith('>input_')) {
            scrapedNodes.push({ type: 'input', name: ast.name.substring(7), frame: frameName });
        }
    }

    if (ast.children && Array.isArray(ast.children)) {
        ast.children.forEach((child: any) => extractScrapedNodes(child, scrapedNodes, frameName));
    }
}
