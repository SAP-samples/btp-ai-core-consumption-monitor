sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/core/HTML"
], function (UIComponent, HTML) {
    "use strict";

    return UIComponent.extend("dashboard.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);
        },

        createContent: function () {
            var sBasePath = sap.ui.require.toUrl("dashboard");
            var sIframeUrl = sBasePath + "/index.html";
            
            return new HTML({
                content: '<iframe id="dashboardFrame" src="' + sIframeUrl + '" ' +
                    'style="width:100%;height:100%;border:none;" ' +
                    'sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox">' +
                    '</iframe>',
                preferDOM: false
            });
        }
    });
});