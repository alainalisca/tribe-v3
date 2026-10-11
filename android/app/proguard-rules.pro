# Tribe release shrinking rules (R8). See app/build.gradle.
#
# What is already covered, so it is NOT repeated here:
#   - Capacitor plugins and their bridge methods: @capacitor/android ships
#     consumer rules keeping every class annotated @CapacitorPlugin, every
#     subclass of com.getcapacitor.Plugin, and Cordova plugin classes.
#   - Firebase Messaging: ships its own consumer rules.
#   - Activities, services and receivers: kept because AndroidManifest.xml
#     names them.

# Keep file and line numbers so a crash in Play Console points at real code
# once mapping.txt is uploaded, while hiding the original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Any @JavascriptInterface method is called from the WebView by NAME, which R8
# cannot see. Capacitor's own interfaces are inside kept Plugin subclasses
# today; this keeps the rule true if a future plugin adds one outside them.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
