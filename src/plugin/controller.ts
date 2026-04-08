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

        const nodeASTs = await Promise.all(selection.map(node => parseNode(node, -(node as any).x || 0, -(node as any).y || 0)));

        // 🔍 DEBUG: Count vectors with strokes
        let vectorCount = 0;
        const countVectors = (nodes: any[]) => {
            nodes.forEach(n => {
                if (n.widget === 'SvgPicture' && n.properties.stroke) vectorCount++;
                if (n.children) countVectors(n.children);
            });
        }
        countVectors(nodeASTs);

        figma.notify(`Generation Complete! Detected ${vectorCount} vector strokes. Check Console (Alt+P) for details.`);

        // 🧩 V4.50: Vector Registry — Collect all SVGs and assign reference names
        const vectorRegistry: Map<string, { name: string, processedSvg: string }> = new Map();
        let vectorIndex = 0;
        const collectVectors = (node: any) => {
            if (node.widget === 'SvgPicture' && node.properties.svg) {
                // Generate unique name from layer name
                const baseName = (node.name || `vector_${vectorIndex}`).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                const uniqueName = vectorRegistry.has(baseName) ? `${baseName}_${vectorIndex}` : baseName;
                vectorIndex++;

                // Process SVG (same logic as generator.ts but done once here)
                let svgString = node.properties.svg || '';
                svgString = svgString.replace(/width="[^"]*"/gi, ' ');
                svgString = svgString.replace(/height="[^"]*"/gi, ' ');
                svgString = svgString.replace(/stroke="[^"]*"/gi, ' ');
                svgString = svgString.replace(/stroke-width="[^"]*"/gi, ' ');
                svgString = svgString.replace(/fill="[^"]*"/gi, ' ');
                svgString = svgString.replace(/overflow="[^"]*"/gi, ' ');

                const hasStroke = !!(node.properties.stroke && node.properties.stroke.weight);
                const prefColor = (hasStroke ? node.properties.stroke.color : node.properties.color) || '#000000';
                const hexPaint = prefColor.startsWith('#') ? prefColor : `#${prefColor}`;
                const weight = hasStroke ? Math.max(node.properties.stroke.weight, 1.5) : 1.5;
                let shapeAttrs = `stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd"`;
                if (hasStroke) {
                    shapeAttrs += ` stroke="${hexPaint}" stroke-width="${weight}" fill="none"`;
                } else {
                    shapeAttrs += ` fill="${hexPaint}"`;
                }
                svgString = svgString.replace(/<(path|line|rect|circle|ellipse|polygon|polyline)/gi, (match: string) => `${match} ${shapeAttrs} `);
                let svgSafe = svgString.replace(/'/g, "\\'").replace(/\n/g, '').replace(/\r/g, '');

                vectorRegistry.set(uniqueName, { name: uniqueName, processedSvg: svgSafe });
                node.properties.svgRefName = uniqueName; // Tag the AST node
            }
            if (node.children) node.children.forEach(collectVectors);
        };
        nodeASTs.forEach(collectVectors);

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

        // 🧩 MODULARITY V4.12: Shared Components Collection
        const sharedComponents = new Map<string, any>();
        const findComponents = (node: any) => {
            if (node.isInstance && node.mainComponentId) {
                if (!sharedComponents.has(node.mainComponentId)) {
                    sharedComponents.set(node.mainComponentId, {
                        id: node.mainComponentId,
                        name: node.mainComponentName,
                        ast: JSON.parse(JSON.stringify(node))
                    });
                }
            }
            if (node.children) node.children.forEach(findComponents);
        };
        nodeASTs.forEach(findComponents);

        const componentFiles = Array.from(sharedComponents.values()).map(comp => {
            const className = toPascalCase(comp.name);
            const fileName = comp.name.toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]/g, '_');
            const path = `lib/components/${fileName}.dart`;
            const componentCode = generateFlutterCode(comp.ast, 2, logicNodes, logicEdges, { width: comp.ast.properties.width, height: comp.ast.properties.height }, { ignoreInstance: true });
            
            const content = `import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

class ${className} extends StatelessWidget {
  final String? text;
  final VoidCallback? onTap;

  const ${className}({
    super.key,
    this.text,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ${componentCode.trim()};
  }
}
`;
            return { path, className, fileName, content };
        });

        // 2. Generate Dart Code for Screens
        const screenClassSnippets: string[] = [];
        const registeredClassNames = new Set<string>(); // Zero-Bug: Sinkronisasi rute & class
        const globalImports = new Set<string>();
        globalImports.add("import 'package:flutter/material.dart';");
        globalImports.add("import 'package:flutter_svg/flutter_svg.dart';");
        globalImports.add("import 'package:google_fonts/google_fonts.dart';");

        // 2. Pre-calculate paths for all screens to handle collisions and flattening
        const screenConfigs = nodeASTs.map(ast => {
            const cleanName = ast.name.toLowerCase().replace(/[^a-z0-9\/]/g, '_').replace(/^\/+|\/+$/g, '');
            // Strip lib/, screen/, screens/, page/, pages/ from the start
            const strippedName = cleanName.replace(/^(lib|screen|screens|page|pages)\//i, '');
            return { ast, cleanName, strippedName };
        });

        const strippedCounts: Record<string, number> = {};
        screenConfigs.forEach(cfg => {
            strippedCounts[cfg.strippedName] = (strippedCounts[cfg.strippedName] || 0) + 1;
        });

        // 🧩 V4.50: Persistent Navbar (Shell Routing) Extraction
        const navVariants: { [screenName: string]: any } = {};
        let tabTargets: string[] = [];
        let hasPersistentNav = false;

        nodeASTs.forEach(screenAST => {
            if (screenAST.children) {
                const navIndex = screenAST.children.findIndex((c: any) => c.name && c.name.toLowerCase().startsWith('>nav'));
                if (navIndex !== -1) {
                    hasPersistentNav = true;
                    // 🧩 V4.50+: AUTO-TAB DETECTION
                    // Every screen with a >nav layer is automatically a tab target
                    if (!tabTargets.includes(screenAST.name)) {
                        tabTargets.push(screenAST.name);
                    }
                    
                    // Extract the nav AST from the screen
                    const navAst = screenAST.children.splice(navIndex, 1)[0];
                    navVariants[screenAST.name] = navAst;

                    // Parse tab targets from the very first nav encountered if tabTargets is empty
                    if (tabTargets.length === 0) {
                        const findTargets = (node: any) => {
                            if (node.properties && node.properties.figmaNavigations) {
                                node.properties.figmaNavigations.forEach((n: any) => {
                                    if (n.originalName && !tabTargets.includes(n.originalName)) {
                                        tabTargets.push(n.originalName);
                                    }
                                });
                            }
                            if (node.children) node.children.forEach(findTargets);
                        };
                        findTargets(navAst);
                    }
                }
            }
        });

        const finalScreenMetadata = screenConfigs.map(cfg => {
            let fileName = cfg.strippedName;
            // Collision handling: if "main" exists twice, use underscored name for the prefixed one
            if (strippedCounts[cfg.strippedName] > 1 && cfg.cleanName !== cfg.strippedName) {
                fileName = cfg.cleanName.replace(/\//g, '_');
            }
            const finalPath = `lib/screen/${fileName}.dart`;
            const className = toPascalCase(cfg.ast.name) + 'Screen';
            const routePath = cfg.cleanName; 
            return { ...cfg, fileName, finalPath, className, routePath };
        });

        const mainFiles = finalScreenMetadata.map(meta => {
            const { ast, finalPath, className, fileName } = meta;
            const currentScreenImports = new Set<string>();
            currentScreenImports.add("import 'package:flutter/material.dart';");
            currentScreenImports.add("import 'package:flutter_svg/flutter_svg.dart';");
            currentScreenImports.add("import 'package:google_fonts/google_fonts.dart';");

            const frameWidth = ast.properties.width || 1440;
            const frameHeight = ast.properties.height || 1024;
            const screenSize = { width: frameWidth, height: frameHeight };

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
                const appBarIndex = mainBodyAST.children.findIndex((c: any) => c.widget === 'AppBar');
                if (appBarIndex !== -1) {
                    appBarAST = mainBodyAST.children.splice(appBarIndex, 1)[0];
                }
                const bottomNavIndex = mainBodyAST.children.findIndex((c: any) => c.widget === 'BottomNavigationBar');
                if (bottomNavIndex !== -1) {
                    bottomNavAST = mainBodyAST.children.splice(bottomNavIndex, 1)[0];
                }
            }

            let appBarCode = appBarAST ? generateFlutterCode(appBarAST, 3, logicNodes, logicEdges, screenSize) : '';
            if (appBarCode) {
                appBarCode = `      appBar: PreferredSize(\n        preferredSize: const Size.fromHeight(60.0),\n        child: ${appBarCode.trim()},\n      ),`;
            }

            let bottomNavCode = bottomNavAST ? generateFlutterCode(bottomNavAST, 3, logicNodes, logicEdges, screenSize) : '';
            if (bottomNavCode) {
                bottomNavCode = `      bottomNavigationBar: ${bottomNavCode.trim()},`;
            }

            let widgetTreeCode = generateFlutterCode(mainBodyAST, 3, logicNodes, logicEdges, screenSize, { navTabTargets: tabTargets, isInsideWrapper: false });

            registeredClassNames.add(className);

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
            } else if (isOverlay) {
                bodyWidget = `FittedBox(
          alignment: Alignment.center,
          fit: BoxFit.scaleDown,
          child: SizedBox(
            width: ${frameWidth},
            height: ${effectiveFrameHeight},
            child: ${bodyWidget}
          ),
        )`;
            } else {
                bodyWidget = `Center(
          child: FittedBox(
            alignment: Alignment.center,
            fit: BoxFit.contain,
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

            const findDependencies = (node: any, deps: Set<string>, compDeps: Set<string>) => {
              if (node.properties && node.properties.figmaNavigations) {
                node.properties.figmaNavigations.forEach((r: any) => {
                  if (r.originalName) deps.add(r.originalName);
                });
              }
              if (node.isInstance && node.mainComponentId) {
                const comp = sharedComponents.get(node.mainComponentId);
                if (comp) compDeps.add(comp.name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
              }
              if (node.children) {
                node.children.forEach((c: any) => findDependencies(c, deps, compDeps));
              }
            };
            
            const dependencies = new Set<string>();
            const compDependencies = new Set<string>();
            findDependencies(ast, dependencies, compDependencies);
            
            compDependencies.forEach(compFileName => {
              const importPath = `import 'package:${projectName}/components/${compFileName}.dart';`;
              globalImports.add(importPath);
              currentScreenImports.add(importPath);
            });

            dependencies.forEach(dest => {
              if (dest !== ast.name) {
                const depMeta = finalScreenMetadata.find(m => m.ast.name === dest);
                if (depMeta) {
                    const importPath = `import 'package:${projectName}/screen/${depMeta.fileName}.dart';`;
                    globalImports.add(importPath);
                    currentScreenImports.add(importPath);
                }
              }
            });

            const isTabTarget = tabTargets.findIndex(t => t.toLowerCase().trim() === ast.name.toLowerCase().trim()) !== -1;
            
            let buildMethodContent = '';
            if (ast.name.toLowerCase().includes('overlay')) {
                buildMethodContent = `  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(child: ${bodyWidget}),
    );
  }`;
            } else if (isTabTarget) {
                buildMethodContent = `  @override
  Widget build(BuildContext context) {
    return Container(
      color: ${scaffoldBg},
      child: ${bodyWidget},
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

            // 🧩 V4.50: Collect vectors used by THIS screen
            const screenVectorNames: Set<string> = new Set();
            const findScreenVectors = (node: any) => {
                if (node.properties && node.properties.svgRefName) {
                    screenVectorNames.add(node.properties.svgRefName);
                }
                if (node.children) node.children.forEach(findScreenVectors);
            };
            findScreenVectors(ast);

            let screenVectorConstants = '';
            screenVectorNames.forEach(name => {
                const entry = vectorRegistry.get(name);
                if (entry) {
                    screenVectorConstants += `const String _kSvg${name.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')} = '''${entry.processedSvg}''';\n`;
                }
            });

            let classCode = screenVectorConstants + `\nclass ${className} extends StatefulWidget {
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

        // 3. Generate modular main.dart imports
        const modularMainImports = new Set<string>();
        modularMainImports.add("import 'dart:io';");
        modularMainImports.add("import 'package:flutter/material.dart';");
        modularMainImports.add("import 'package:flutter_svg/flutter_svg.dart';");
        modularMainImports.add("import 'package:google_fonts/google_fonts.dart';");
        modularMainImports.add("import 'package:window_manager/window_manager.dart';");

        mainFiles.forEach(f => {
            if (f.path !== 'lib/main.dart') {
                modularMainImports.add(`import 'package:${projectName}/${f.path.replace('lib/', '').replace('.dart', '')}.dart';`);
            }
        });

        componentFiles.forEach(cf => {
            modularMainImports.add(`import 'package:${projectName}/components/${cf.fileName}.dart';`);
        });

        const finalModularImports = Array.from(modularMainImports).join('\n');

        // 🧩 V4.50: Generate MainWrapperScreen if Persistent Navbar exists
        let mainWrapperCode = '';
        if (hasPersistentNav && tabTargets.length > 0) {
            const wrapperImports = Array.from(modularMainImports).join('\n');
            let navVariantNodes: string[] = [];
            let navX = 0;
            let navY = 0;
            
            // Build the switchable variants array
            finalScreenMetadata.forEach(meta => {
                const screenAstName = meta.ast.name.toLowerCase().trim();
                const targetIdx = tabTargets.findIndex(t => t.toLowerCase().trim() === screenAstName);
                if (targetIdx !== -1) {
                    const navAst = navVariants[screenAstName] || Object.values(navVariants)[0]; // Fallback if screen didn't have one
                    
                    if (navX === 0 && navY === 0) {
                        navX = navAst.properties.x || 0;
                        navY = navAst.properties.y || 0;
                    }
                    
                    // Generate it with offset 0 and special genOptions
                    const navFlutter = generateFlutterCode(navAst, 6, logicNodes, logicEdges, { width: 1440, height: 1024 }, { navTabTargets: tabTargets, ignoreInstance: true, isInsideWrapper: true });
                    navVariantNodes[targetIdx] = navFlutter.trim();
                }
            });

            // Fill holes if any variant missing
            for(let i=0; i<tabTargets.length; i++) {
                if(!navVariantNodes[i]) navVariantNodes[i] = navVariantNodes.find(n => n) || 'const SizedBox()';
            }

            const screensList = tabTargets.map(t => {
                const meta = finalScreenMetadata.find(m => m.ast.name === t);
                return meta ? `const ${meta.className}()` : 'const SizedBox()';
            }).join(', ');

        // 🌐 PRECISION V4.61: Correct Hex Color Formatting
        const fWidth = nodeASTs[0].properties.width || 1440;
        const fHeight = nodeASTs[0].properties.height || 1024;
        const designBg = nodeASTs[0].properties.backgroundColor || 'FFFFFF';
        let designBgCode = 'Colors.white';
        
        if (typeof designBg === 'string') {
            if (designBg.startsWith('Color')) {
                designBgCode = `const ${designBg}`;
            } else if (designBg.length === 6) {
                designBgCode = `const Color(0xFF${designBg.toUpperCase()})`;
            }
        }

        mainWrapperCode = `class MainWrapperScreen extends StatefulWidget {
  const MainWrapperScreen({super.key});

  @override
  State<MainWrapperScreen> createState() => _MainWrapperScreenState();
}

class _MainWrapperScreenState extends State<MainWrapperScreen> {
  int _currentIndex = 0;
  bool _isInit = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInit) {
      final args = ModalRoute.of(context)?.settings.arguments;
      if (args != null && args is int) {
        _currentIndex = args;
      }
      _isInit = true;
    }
  }

  void _onTabTapped(int index) {
    setState(() {
      _currentIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    // Figma-derived Nav UI variants based on tab index
    final List<Widget> _navVariants = [
      ${navVariantNodes.join(',\n      ')}
    ];

    return Scaffold(
      backgroundColor: ${designBgCode},
      body: Stack(
        children: [
          // 📦 Layer 1: Centered Page Content
          Center(
            child: FittedBox(
              alignment: Alignment.center,
              fit: BoxFit.contain,
              child: SizedBox(
                width: ${fWidth},
                height: ${fHeight},
                child: IndexedStack(
                  index: _currentIndex,
                  children: [
                    ${screensList}
                  ],
                ),
              ),
            ),
          ),
          // 🛠️ Layer 2: Edge-Pinned Navigation Sidebar
          Align(
            alignment: Alignment.topLeft,
            child: FittedBox(
              alignment: Alignment.topLeft,
              fit: BoxFit.contain,
              child: SizedBox(
                width: ${fWidth},
                height: ${fHeight},
                child: Stack(
                  children: [
                    Positioned(
                      left: ${navX},
                      top: ${navY},
                      child: _navVariants[_currentIndex],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}`;
            screenClassSnippets.push(mainWrapperCode);
            mainFiles.push({
                path: 'lib/screen/main_wrapper.dart',
                content: wrapperImports + '\n\n' + mainWrapperCode
            });
            modularMainImports.add(`import 'package:${projectName}/screen/main_wrapper.dart';`);
            registeredClassNames.add('MainWrapperScreen');
        }

        let routeMapEntries = finalScreenMetadata.map((meta) => {
            const { ast, className, routePath } = meta;
            if (!registeredClassNames.has(className)) return null;
            return `        '/${routePath}': (context) => ${className}(),`;
        }).filter(r => r !== null);
        
        if (hasPersistentNav) {
            routeMapEntries.push(`        '/main_wrapper': (context) => MainWrapperScreen(),`);
        }
        
        const routeMapEntriesStr = routeMapEntries.join('\n');

        // 🎨 MASTER MODE: Hanya sertakan import inti (Material, Svg, Fonts)
        // Ditempatkan di baris paling atas untuk menghindari error sintaksis Dart.
        const masterOnlyImports = new Set<string>();
        masterOnlyImports.add("import 'dart:io';");
        masterOnlyImports.add("import 'package:flutter/material.dart';");
        masterOnlyImports.add("import 'package:flutter_svg/flutter_svg.dart';");
        masterOnlyImports.add("import 'package:google_fonts/google_fonts.dart';");
        masterOnlyImports.add("import 'package:window_manager/window_manager.dart';");

        const firstScreenName = finalScreenMetadata[0].ast.name.toLowerCase().trim();
        const isFirstScreenTabTarget = tabTargets.some(t => t.toLowerCase().trim() === firstScreenName);
        const initialRoutePath = (hasPersistentNav && isFirstScreenTabTarget) ? 'main_wrapper' : finalScreenMetadata[0].routePath;
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
${routeMapEntriesStr}
      },
    );
  }
}
`;

        // 🧩 V4.50: SVG vectors are now stored as asset files, not inline
        const masterImportsHeader = Array.from(masterOnlyImports).join('\n');
        const allComponentsContent = componentFiles.map(cf => cf.content.split('\n').filter(line => !line.trim().startsWith('import ')).join('\n')).join('\n\n');
        const allScreensContent = screenClassSnippets.join('\n\n');
        const dartCodeOutput = masterImportsHeader + '\n' + mainDartContent + '\n' + allComponentsContent + '\n\n' + allScreensContent;
        
        // 🧩 MODULAR ENTRY POINT (V4.5): main.dart yang bersih hanya dengan import + setup
        const finalModularImportsList = Array.from(modularMainImports).join('\n');
        const modularMainDartContent = finalModularImportsList + '\n' + mainDartContent;

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

        // 5. Unified allcode.dart (For Debugging & Sharing)
        const allCodeContent = `/* 
  🚀 FIGMA TO FLUTTER V4 - ALL-IN-ONE DEBUG FILE
  Copy and send this file to Antigravity for debugging!
*/

// ==========================================
// 📄 PUBSPEC.YAML
// ==========================================
/*
${pubspecContent}
*/

// ==========================================
// 🎯 ALL DART CODE (Entry + Screens)
// ==========================================
${dartCodeOutput}`;

        // 6. Unified main.dart Packaging (V4.11)
        let finalFiles: { path: string, content: string }[] = [];
        finalFiles.push({ path: 'allcode.dart', content: allCodeContent });
        finalFiles.push({ path: '[Boilerplate] pubspec.yaml', content: pubspecContent });
        finalFiles.push({ path: 'lib/main.dart', content: modularMainDartContent });


        // Tambahkan file component ke dalam daftar
        componentFiles.forEach(cf => {
            finalFiles.push({ path: cf.path, content: cf.content });
        });

        // Tambahkan file screen lainnya ke dalam daftar (Filter lib/main.dart agar tidak dobel)
        mainFiles.forEach(f => {
            if (f.path !== 'lib/main.dart') {
                finalFiles.push(f);
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
