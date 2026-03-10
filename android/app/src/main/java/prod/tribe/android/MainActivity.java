package prod.tribe.android;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable hardware acceleration on the WebView for smoother scrolling
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }
    }
}
