// ==UserScript==
// @name         Rule34.xxx: New mail notification
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Sends a desktop notification when you receive new mail
// @author       Kivl/mja00
// @match        https://rule34.xxx/*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// ==/UserScript==

let hasNotifiedAboutMail = false;
let timeToWait = 5;

function reportAJAX_Error (rspObj) {
    console.error (`TM scrpt => Error ${rspObj.status}!  ${rspObj.statusText}`);
}

function onNotificationInteract() {
    GM_xmlhttpRequest ( {
            method:         "GET",
            url:            "https://rule34.xxx/index.php?page=gmail&s=list",
            responseType:   "html",
        } );
    console.log("Notification was interacted with. Visiting inbox to clear notif");
    window.focus();
    hasNotifiedAboutMail = false;
}

function processJSON_Response (rspObj) {
    var parser = new DOMParser ();
    var responseDoc = parser.parseFromString (rspObj.response, "text/html");
    let mailElement = responseDoc.getElementById("has-mail-notice");
    let receivedMail = !mailElement.style.display.includes("none");
    console.log(receivedMail);
    if (receivedMail && !hasNotifiedAboutMail) {
        console.log("Mail has been received. Sending notification.")
        GM_notification ( {title: 'Rule34.xxx', text: "You've received new mail!", silent: true, timeout: 5, onclick: onNotificationInteract, ondone: onNotificationInteract});
        hasNotifiedAboutMail = true;
    }
}

(function() {
    'use strict';

    // Create a function that runs every so often
    javascript:setInterval(function(){
        console.log("Checking for new mail")
        GM_xmlhttpRequest ( {
            method:         "GET",
            url:            "https://rule34.xxx/index.php?page=account&s=home",
            responseType:   "html",
            onload:         processJSON_Response,
            onabort:        reportAJAX_Error,
            onerror:        reportAJAX_Error,
            ontimeout:      reportAJAX_Error
        } );
    }, timeToWait * 1000);
})();
