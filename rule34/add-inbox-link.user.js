// ==UserScript==
// @name         Rule34.xxx: Add Inbox link to navbar
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds an inbox link to the navbar
// @author       You
// @match        https://rule34.xxx/index.php*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
  
    let header = document.getElementById("header");
    let navbarList = header.getElementsByTagName("ul")[0];

    // Create new item for the inbox
    let inboxListElement = document.createElement("li");
    inboxListElement.innerHTML = '<a href="https://rule34.xxx/index.php?page=gmail&s=list">Inbox</a>'
    // Inserts before the post link, but after the My Account link
    navbarList.insertBefore(inboxListElement, navbarList.children[1]);
})();
