// ==UserScript==
// @name         Rule34.xxx: Navbar improvements
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds and improves on the navbar
// @author       mja00
// @match        https://rule34.xxx/index.php*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @run-at       document-end
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/js-cookie@3.0.1/dist/js.cookie.min.js
// ==/UserScript==

(function() {
    'use strict';


    function GM_addStyle(css) {
        const style = document.getElementById("GM_addStyleBy8626") || (function() {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.id = "GM_addStyleBy8626";
            document.head.appendChild(style);
            return style;
        })();
        const sheet = style.sheet;
        sheet.insertRule(css, (sheet.rules || sheet.cssRules || []).length);
        console.log(`Inserted CSS: ${css}`)
    }

    //GM_addStyle(".dropdown { float: left; }");
    GM_addStyle(".dropdown .dropbtn { font-size: 16px; border: none; outline: none; background-color: inherit; font-family: inherit; margin: 0; color: #009;}");
    GM_addStyle(".dropdown-content { display: none; position: absolute; background-color: #93c393; min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2); z-index: 1; }");
    GM_addStyle(".dropdown-content a { float: none; color: black; padding: 12px 16px; text-decoration: none; display: block; text-align: left; }");
    GM_addStyle(".dropdown-content a:hover { background-color: #ddd; }");
    GM_addStyle(".dropdown:hover .dropdown-content { display: block; }");
  
    let header = document.getElementById("header");
    let navbarList = header.getElementsByTagName("ul")[0];
    let inboxURI = "https://rule34.xxx/index.php?page=gmail&s=list"

    // Create new item for the inbox
    let inboxListElement = document.createElement("li");
    inboxListElement.innerHTML = `<a href="${inboxURI}">Inbox</a>`
    // Inserts before the post link, but after the My Account link
    if (window.location.href == inboxURI) {
        inboxListElement.setAttribute("class", "current-page");
    }
    navbarList.insertBefore(inboxListElement, navbarList.children[1]);

    // Replace My Account with a proper dropdown
    let myAccountListElement = navbarList.children[0]
    let userID = Cookies.get("user_id");
    myAccountListElement.setAttribute("class", "dropdown");
    let myAccountATag = myAccountListElement.querySelector("a");
    myAccountATag.setAttribute("class", "dropbtn");
    let myAccountDropdownDiv = document.createElement("div");
    myAccountDropdownDiv.setAttribute("class", "dropdown-content");
    let dropdownHTML = `
          <a href="https://rule34.xxx/index.php?page=account&s=profile&id=${userID}">My Profile</a>
          <a href="https://rule34.xxx/index.php?page=gmail&s=list">My Mail</a>
          <a href="https://rule34.xxx/index.php?page=favorites&s=view&id=${userID}">My Favorites</a>
          <a href="https://rule34.xxx/index.php?page=account&s=change_password">Change Password</a>
          <a href="https://rule34.xxx/index.php?page=account&s=change_email">Change Email</a>
          <a href="https://rule34.xxx/index.php?page=favorites&s=list">Everyone's Favorites</a>
          <a href="https://rule34.xxx/index.php?page=account&s=options">Options</a>
          <a href="https://rule34.xxx/index.php?page=account&s=login&code=01">Logout</a>
    `;
    myAccountDropdownDiv.innerHTML = dropdownHTML;
    myAccountListElement.appendChild(myAccountDropdownDiv);
})();
