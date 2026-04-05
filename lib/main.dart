import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

void main() {
  runApp(const MyApp());
}

class AppColors {
  // No Figma Local Styles found.
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
          seedColor: Colors.deepPurple,
        ),
        useMaterial3: true,
      ),
      initialRoute: '/main',
      routes: {
        '/main': (context) => const ScreenMainScreen(),
        '/screen/main': (context) => const ScreenMainScreen(),
        '/screen/overlay': (context) => const ScreenOverlayScreen(),
      },
    );
  }
}

class ScreenMainScreen extends StatefulWidget {
  const ScreenMainScreen({super.key});

  @override
  State<ScreenMainScreen> createState() => _ScreenMainScreenState();
}

class _ScreenMainScreenState extends State<ScreenMainScreen> {
  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFFFFFF),
      body: SingleChildScrollView(
        child: FittedBox(
          alignment: Alignment.topCenter,
          fit: BoxFit.scaleDown,
          child: Container(
            width: 1440,
            height: 1024,
            color: const Color(0xFFFFFFFF),
            child: Stack(
              children: [
                Positioned(
                  left: 346,
                  top: 388,
                  child: SizedBox(
                    width: 793,
                    child: Text(
                      'itulah pokoknya\n',
                      style: const TextStyle(
                        fontSize: 96,
                        color: Color(0xFF000000),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 463,
                  top: 620,
                  child: GestureDetector(
                    onTap: () async {
                      // 🎨 SKELETON: Rangka ini siap dipoles dengan logic backend Anda!
                      // Layer Name: >btn_next
                      
                      // 🤖 LOGIC KONEKSI DARI NODE EDITOR:
                      showGeneralDialog(
                        context: context,
                        barrierDismissible: true,
                        barrierLabel: '',
                        barrierColor: Colors.black54,
                        pageBuilder: (context, anim1, anim2) => Align(
                          alignment: Alignment.center,
                          child: Material(
                            color: Colors.transparent,
                            child: const ScreenOverlayScreen(),
                          ),
                        ),
                      );

                      // TODO (Backend): Tambahkan pemolesan logic untuk next di sini.
                    },
                    child: Container(
                      width: 514,
                      height: 109,
                      child: Stack(
                        children: [
                          Positioned(
                            left: 0,
                            top: 0,
                            child: Container(
                              width: 514,
                              height: 109,
                              decoration: BoxDecoration(
                                color: const Color(0xFFD9D9D9),
                                borderRadius: BorderRadius.circular(90),
                              ),
                            ),
                          ),
                          Positioned(
                            left: 191,
                            top: 8,
                            child: SizedBox(
                              width: 135,
                              child: Text(
                                'next\n',
                                style: const TextStyle(
                                  fontSize: 64,
                                  color: Color(0xFF000000),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class ScreenOverlayScreen extends StatefulWidget {
  const ScreenOverlayScreen({super.key});

  @override
  State<ScreenOverlayScreen> createState() => _ScreenOverlayScreenState();
}

class _ScreenOverlayScreenState extends State<ScreenOverlayScreen> {
  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(
        child: SingleChildScrollView(
          child: FittedBox(
            alignment: Alignment.topCenter,
            fit: BoxFit.scaleDown,
            child: Container(
              width: 585,
              height: 271,
              child: Stack(
                children: [
                  Positioned(
                    left: 0,
                    top: 0,
                    child: Container(
                      width: 585,
                      height: 271,
                      color: const Color(0xFFFFFFFF),
                    ),
                  ),
                  Positioned(
                    left: 97,
                    top: 80,
                    child: Text(
                      'kamu sukses',
                      style: const TextStyle(
                        fontSize: 64,
                        color: Color(0xFF000000),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
