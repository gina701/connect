package mw.mzuzuconnect.prospects;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String PREFS = "mzuzu_connect_app";
    private static final String SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "https://connect-zj8v.onrender.com";
    private static final int GREEN = Color.rgb(21, 120, 95);

    private EditText serverField;
    private TextView hint;
    private WebView webView;
    private String currentAuthority = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(GREEN);
        getWindow().setNavigationBarColor(Color.rgb(18, 59, 52));
        setContentView(createLayout());
        serverField.setText(getPreferences(MODE_PRIVATE).getString(SERVER_URL, DEFAULT_SERVER_URL));
        serverField.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                connectToServer();
                return true;
            }
            return false;
        });
        configureWebView();

        String savedUrl = serverField.getText().toString().trim();
        if (!savedUrl.isEmpty()) {
            connectToServer();
        }
    }

    private View createLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(243, 246, 244));

        TextView title = new TextView(this);
        title.setText("Mzuzu Connect");
        title.setTextColor(Color.rgb(22, 59, 52));
        title.setTextSize(20);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setPadding(dp(18), dp(15), dp(18), dp(3));
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Prospect workspace");
        subtitle.setTextColor(Color.rgb(99, 118, 113));
        subtitle.setTextSize(13);
        subtitle.setPadding(dp(18), 0, dp(18), dp(10));
        root.addView(subtitle);

        LinearLayout connection = new LinearLayout(this);
        connection.setOrientation(LinearLayout.HORIZONTAL);
        connection.setPadding(dp(14), dp(5), dp(14), dp(3));
        connection.setGravity(android.view.Gravity.CENTER_VERTICAL);

        serverField = new EditText(this);
        serverField.setSingleLine(true);
        serverField.setTextSize(13);
        serverField.setHint("https://your-app.onrender.com");
        serverField.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        serverField.setImeOptions(EditorInfo.IME_ACTION_GO);
        connection.addView(serverField, new LinearLayout.LayoutParams(0, dp(50), 1));

        Button connect = new Button(this);
        connect.setText("Open");
        connect.setTextColor(Color.WHITE);
        connect.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GREEN));
        connect.setOnClickListener(view -> connectToServer());
        LinearLayout.LayoutParams connectParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(48));
        connectParams.leftMargin = dp(8);
        connection.addView(connect, connectParams);
        root.addView(connection);

        hint = new TextView(this);
        hint.setText("Enter your team's HTTPS Render app link. It will be saved on this phone.");
        hint.setTextColor(Color.rgb(99, 118, 113));
        hint.setTextSize(11);
        hint.setPadding(dp(18), dp(2), dp(18), dp(8));
        root.addView(hint);

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        return root;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setBackgroundColor(Color.rgb(243, 246, 244));
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme())
                        && uri.getAuthority() != null
                        && uri.getAuthority().equalsIgnoreCase(currentAuthority)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }
        });
    }

    private void connectToServer() {
        String value = serverField.getText().toString().trim();
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            hint.setText("Enter the full HTTPS link to your deployed Render app.");
            serverField.setError("Use a valid https:// app URL");
            return;
        }

        currentAuthority = uri.getAuthority();
        serverField.setError(null);
        getPreferences(MODE_PRIVATE).edit().putString(SERVER_URL, value).apply();
        webView.loadUrl(value);
        hint.setText("Connected to " + uri.getHost() + ". Use your team's dashboard password to sign in.");
    }

    private void openExternal(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"mailto".equalsIgnoreCase(uri.getScheme())
                && !"tel".equalsIgnoreCase(uri.getScheme())) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (android.content.ActivityNotFoundException exception) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
