// ==UserScript==
// @name         Rule34.xxx: New mail notification
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sends a desktop notification when you receive new mail
// @author       Kivl/mja00
// @match        https://rule34.xxx/*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// ==/UserScript==

let hasNotifiedAboutMail = false;
let timeToWait = 30;

function reportAJAX_Error (rspObj) {
    console.error (`TM scrpt => Error ${rspObj.status}!  ${rspObj.statusText}`);
}

function processJSON_Response (rspObj) {
    let receivedMail = rspObj.response.includes("You have mail");
    if (receivedMail && !hasNotifiedAboutMail) {
        console.log("Mail has been received. Sending notification.")
        GM_notification ( {title: 'Rule34.xxx', text: "You've received new mail!", silent: true, timeout: 5} );
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
