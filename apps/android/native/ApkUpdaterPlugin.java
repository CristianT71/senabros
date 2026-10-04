package com.senabros.game;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Actualizador de SENA Bros: descarga el APK nuevo mostrando el progreso y abre el instalador de Android.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private volatile boolean busy = false;

    // Google: el navegador vuelve con senabros://auth?... y llega aquí como intent
    private void emitAuth(Intent i) {
        if (i == null || i.getData() == null || !"senabros".equals(i.getData().getScheme())) return;
        JSObject d = new JSObject();
        d.put("url", i.getData().toString());
        i.setData(null);
        notifyListeners("authUrl", d, true);
    }

    @Override
    public void load() {
        emitAuth(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        emitAuth(intent);
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("url"); return; }
        try {
            // Pestaña del navegador dentro de la app (Chrome Custom Tabs): Google se abre encima del juego
            CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
            tab.launchUrl(getActivity(), Uri.parse(url));
        } catch (Exception e) {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "update");
        dir.mkdirs();
        return new File(dir, "SenaBros.apk");
    }

    // Zona de la cámara frontal en píxeles CSS: el juego se dibuja debajo, pero el marcador y los botones se apartan
    @PluginMethod
    public void insets(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowInsetsCompat w = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            Insets c = w == null ? Insets.NONE : w.getInsets(WindowInsetsCompat.Type.displayCutout());
            float d = getContext().getResources().getDisplayMetrics().density;
            JSObject r = new JSObject();
            r.put("left", c.left / d);
            r.put("top", c.top / d);
            r.put("right", c.right / d);
            r.put("bottom", c.bottom / d);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("version", pi.versionName);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("info");
        }
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final long size = call.getLong("size", 0L);
        if (url == null || !url.startsWith("https://")) { call.reject("url"); return; }
        if (busy) { call.reject("busy"); return; }
        busy = true;
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File out = apkFile();
                if (out.exists()) out.delete();
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : size;
                long loaded = 0, last = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        loaded += n;
                        long now = System.currentTimeMillis();
                        if (now - last > 120) {
                            last = now;
                            JSObject d = new JSObject();
                            d.put("loaded", loaded);
                            d.put("total", total);
                            d.put("percent", total > 0 ? loaded * 100.0 / total : 0);
                            notifyListeners("progress", d);
                        }
                    }
                }
                if (total > 0 && loaded < total) throw new Exception("incompleto");
                JSObject d = new JSObject();
                d.put("loaded", loaded);
                d.put("total", loaded);
                d.put("percent", 100);
                notifyListeners("progress", d);
                call.resolve();
            } catch (Exception e) {
                call.reject("download: " + e.getMessage());
            } finally {
                busy = false;
                if (c != null) c.disconnect();
            }
        }).start();
    }

    // Instala con una sesión de PackageInstaller: el APK se copia al sistema ANTES de abrir el instalador, así la instalación
    // no depende de que esta app siga "despierta" (Android congela las apps en segundo plano y el instalador se quedaba en "Instalando...").
    @PluginMethod
    public void install(final PluginCall call) {
        final Context ctx = getContext();
        final File f = apkFile();
        if (!f.exists()) { call.reject("nofile"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            call.reject("permission", "permission");
            return;
        }
        new Thread(() -> {
            try {
                PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(ctx.getPackageName());
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                int id = pi.createSession(params);
                PackageInstaller.Session session = pi.openSession(id);
                try (InputStream in = new FileInputStream(f); OutputStream out = session.openWrite("SenaBros.apk", 0, f.length())) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                Intent result = new Intent(ctx, InstallReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pending = PendingIntent.getBroadcast(ctx, id, result, flags);
                session.commit(pending.getIntentSender());
                session.close();
                call.resolve();
            } catch (Exception e) {
                // si la sesión falla, se usa el instalador clásico
                try {
                    Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                    call.resolve();
                } catch (Exception e2) {
                    call.reject("install: " + e2.getMessage());
                }
            }
        }).start();
    }
}
