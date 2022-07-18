// ==UserScript==
// @name         Rule34.xxx: Kivl's Improvements
// @namespace    http://tampermonkey.net/
// @version      1.11
// @description  A bunch of improvements for the Rule34.xxx website created by Kivl
// @author       Kivl/mja00
// @match        https://rule34.xxx/*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_listValues
// @require      https://cdn.jsdelivr.net/npm/js-cookie@3.0.1/dist/js.cookie.min.js
// @require      https://raw.githubusercontent.com/eligrey/FileSaver.js/master/dist/FileSaver.js
// @downloadURL  https://github.com/mja00/userscripts/raw/main/rule34/kivls-improvements.user.js
// @updateURL    https://github.com/mja00/userscripts/raw/main/rule34/kivls-improvements.user.js
// ==/UserScript==

// First we'll get all of our settings out of the way

// Enable/disable scrubbing the forums.
var scrubForums_ = "scrubForums"; var scrubForums = getSetting(scrubForums_, true);
// Blacklisted list of users
var blacklistedUsers_ = "blacklistedUsers"; var blacklistedUsers = getSetting(blacklistedUsers_, []);
// Setting for max length scrubbing
var scrubMaxLength_ = "scrubMaxLength"; var scrubMaxLength = getSetting(scrubMaxLength_, true);
// Setting for the Inbox link in the navbar
var inboxLink_ = "inboxLink"; var inboxLink = getSetting(inboxLink_, true);
// Setting for the My Account navbar element replacement
var myAccountLink_ = "myAccountLink"; var myAccountLink = getSetting(myAccountLink_, true);
// Settings for changing forum post timestamps to local time
var forumLocalTime_ = "forumLocalTime"; var forumLocalTime = getSetting(forumLocalTime_, true);
// Setting for adding relative time to the forum posts
var forumRelativeTime_ = "forumRelativeTime"; var forumRelativeTime = getSetting(forumRelativeTime_, true);
// Setting for shwoing character count of post
var showCharCount_ = "showCharCount"; var showCharCount = getSetting(showCharCount_, true);
// Setting for opening posts in a new tab
var openPostsInNewTab_ = "openPostsInNewTab"; var openPostsInNewTab = getSetting(openPostsInNewTab_, true);
// Setting for receiving notification when you get mail
var receiveMailNotification_ = "receiveMailNotification"; var receiveMailNotification = getSetting(receiveMailNotification_, true);
// Setting for mail check interval in seconds
var mailCheckInterval_ = "mailCheckInterval"; var mailCheckInterval = getSetting(mailCheckInterval_, 30);
// Setting for using the keys on posts to go forward and back
var arrowKeysToMove_ = "arrowKeysToMove"; var arrowKeysToMove = getSetting(arrowKeysToMove_, true);
// Hide blacklisted users entirely
var completelyHideBlacklist_ = "completelyHideBlacklist"; var completelyHideBlacklist = getSetting(completelyHideBlacklist_, false);
// Keep track of what pages you've seen for a forum thread
var trackForumThreadPages_ = "trackForumThreadPages"; var trackForumThreadPages = getSetting(trackForumThreadPages_, false);

// Max content length settings
var maxContentLength_ = "maxContentLength"; var maxContentLength = getSetting(maxContentLength_, 1500);
if (maxContentLength == -1) {
    // Set a high value for max content length
    maxContentLength = 999999999;
}

// Our setting getting function
function getSetting(settingName, settingDefault) {
    let value = GM_getValue(settingName, null);
    if (value == null) {
        GM_setValue(settingName, settingDefault);
        value = settingDefault;
    }
    return value;
}

function saveSettingsToDisk() {

    let jsonData = {};
    let values = GM_listValues();

    for (let i = 0; i < values.length; i++) {
        let name = values[i]
        jsonData[name] = GM_getValue(name, null);
    }

    const str = JSON.stringify(jsonData);
    const bytes = new TextEncoder().encode(str);
    const blob = new Blob([bytes], {
        type: "application/json;charset=utf-8"
    });

    saveAs(blob, "backup.json");
}


// Variables for checking what page we're on
var isPage_post = document.location.href.includes("index.php?page=post&s=view");
var isPage_posts = document.location.href.includes("index.php?page=post&s=list");
var isPage_fav = document.location.href.includes("index.php?page=favorites&s=view");
var isPage_opt = document.location.href.includes("index.php?page=account&s=options");
var isPage_forum = document.location.href.includes("index.php?page=forum&s=view&id=");
var isPage_main = (document.location.href == "http://rule34.xxx/" || document.location.href == "https://rule34.xxx/");

// Post listing page
if (isPage_posts) {
    if (openPostsInNewTab) {
        fixATags(true);
        javascript:setInterval(function() { fixATags(false); }, 2 * 1000);
    }
}

// Post page
if (isPage_post) {
    // Get current post ID
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const postID = urlParams.get('id');

    let targetPostID = postID;

    //We want to register an event listener now
    if (arrowKeysToMove) {
        document.addEventListener('keydown', onKeyDown, true);
    }

    function decAndCheck() {
        targetPostID--;
        let targetURL = `https://rule34.xxx/index.php?page=post&s=view&id=${targetPostID}`;
        checkPostID(targetPostID, true);
    }

    function incAndCheck() {
        targetPostID++;
        let targetURL = `https://rule34.xxx/index.php?page=post&s=view&id=${targetPostID}`;
        checkPostID(targetPostID, false);
    }

    function onKeyDown(event) {
        if (event.key == "ArrowLeft") {
            incAndCheck();
        } else if (event.key == "ArrowRight") {
            decAndCheck();
        } else {
            return;
        }
    }
}

// Stuff for mail notifications
if (receiveMailNotification) {

    let hasNotifiedAboutMail = false;
    let timeToWait = getSetting(mailCheckInterval_, 30);

    // These are all functions for callbacks for mail notifications
    function reportAJAX_Error (rspObj) {
        console.error (`TM scrpt => Error ${rspObj.status}!  ${rspObj.statusText}`);
    }
    // This means someone clicked on the notification, so we'll mark it as read
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

    function checkForNewMail() {
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
    }

    function processJSON_Response (rspObj) {
        var parser = new DOMParser ();
        var responseDoc = parser.parseFromString (rspObj.response, "text/html");
        let mailElement = responseDoc.getElementById("has-mail-notice");
        let receivedMail = !mailElement.style.display.includes("none");
        if (receivedMail && !hasNotifiedAboutMail) {
            console.log("Mail has been received. Sending notification.")
            GM_notification ( {title: 'Rule34.xxx', text: "You've received new mail!", silent: true, timeout: 5, onclick: onNotificationInteract, ondone: onNotificationInteract});
            hasNotifiedAboutMail = true;
        }
    }

    // Now we need to set up our interval to check for new mail
    // Check on page load
    checkForNewMail();

    // Create a function that runs every so often
    javascript:setInterval(function(){
        checkForNewMail();
    }, timeToWait * 1000);

}

// Navar modifications
if (!isPage_main) {
    // We're not on the main page so we'll do navbar modifications
    let header = document.getElementById("header");
    let navbarList = header.getElementsByTagName("ul")[0];
    if (inboxLink) {
        let inboxURI = "https://rule34.xxx/index.php?page=gmail&s=list"

        // Create new item for the inbox
        let inboxListElement = document.createElement("li");
        inboxListElement.innerHTML = `<a href="${inboxURI}">Inbox</a>`
        // Inserts before the post link, but after the My Account link
        if (window.location.href == inboxURI) {
            inboxListElement.setAttribute("class", "current-page");
        }
        navbarList.insertBefore(inboxListElement, navbarList.children[1]);
    }

    if (myAccountLink) {
        // Injects the CSS needed for the navbar element replacement
        GM_addStyle(".dropdown .dropbtn { font-size: 16px; border: none; outline: none; background-color: inherit; font-family: inherit; margin: 0; color: #009;}");
        GM_addStyle(".dropdown-content { display: none; position: absolute; background-color: var(--c-bg, #93c393); min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2); z-index: 1; }");
        GM_addStyle(".dropdown-content a { float: none; color: black; padding: 12px 16px; text-decoration: none; display: block; text-align: left; }");
        GM_addStyle(".dropdown-content a:hover { background-color: #ddd; }");
        GM_addStyle(".dropdown:hover .dropdown-content { display: block; }");

        // Now we actually replace the navbar element
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
    }

    // This will append a center tag to the body with the version of the script
    let scriptVersion = GM_info.script.version;
    let scriptVersionElement = document.createElement("center");
    scriptVersionElement.innerHTML = `<p>Kivl's Improvements version: ${scriptVersion} | Report issues <a href="https://github.com/mja00/userscripts/issues">here</a></p>`;
    document.body.appendChild(scriptVersionElement);
}

// Forums related modifications
if (isPage_forum) {
    // We'll first do the forums timestamp modifications
    let dateOptions = {year: 'numeric', month: 'numeric', day: 'numeric', minute: 'numeric', hour: 'numeric' };
    let currentTime = new Date();

    // Get all the post elements
    let elements = document.getElementById("forum").querySelectorAll("div.author");
    for (const item of elements) {
        // Date related information about the post
        let dateElement = item.querySelector("span");
        let dateStringFull = dateElement.innerHTML;
        let dateAMOrPM = dateStringFull.slice(-3);
        let date = new Date(dateStringFull.slice(0, -3) + ":00 " + dateAMOrPM + " UTC");
        if (forumLocalTime) {
            dateElement.innerHTML = date.toLocaleDateString("en-US", dateOptions);
        }
        if (forumRelativeTime) {
            dateElement.innerHTML += "<br>" + timeDifference(currentTime, date);
        }

        // We can do post modifications here since we're looping through the posts
        if (scrubForums) {
            // Get the name of the poster
            let nameElement = item.querySelectorAll("h6 > a:nth-child(2)")[0];
            let name = nameElement.innerHTML;
            let parent = item.parentElement;

            // Content length stuff
            let content = parent.querySelectorAll("div.content > div.body")[0];
            let contentLength = stripHtml(content.innerHTML).length;

            if (showCharCount) {
                let contentLengthElement = document.createElement("span");
                contentLengthElement.innerHTML = `<br>${contentLength} characters`;
                contentLengthElement.setAttribute("class", "date");
                item.appendChild(contentLengthElement);
            }

            // Adds our blacklist button
            addBlacklistButtonToPost(item, name);

            /* Removes a post if:
            * - The post is from a blacklisted user
            * - The post is empty(length of 1)
            * - The post is over a set amount of characters and the user has enabled the option
            */
            if (blacklistedUsers.includes(name) || contentLength == 1 || (contentLength > maxContentLength && scrubMaxLength)) {
                console.log("Found post by " + name + ". Removing.");
                parent.querySelector(".content").style.display = "none";
                parent.style.marginBottom = "0";
                item.style.display = "none";
                if (!completelyHideBlacklist) {
                    // Append our own content div saying it was hidden
                    let contentDiv = document.createElement("div");
                    contentDiv.className = "content";
                    contentDiv.innerHTML = `Post by ${name} hidden.`

                    let showButton = document.createElement("button");
                    showButton.innerHTML = "Show Anyway";
                    showButton.style.border = "none";
                    showButton.style.backgroundColor = "inherit";
                    showButton.style.color = "blue";
                    showButton.onclick = function () {
                        contentDiv.style.display = "none";
                        parent.querySelector(".content").style.removeProperty("display");
                        item.style.removeProperty("display");
                        parent.style.removeProperty("margin-bottom");
                    }

                    contentDiv.appendChild(showButton);
                    parent.appendChild(contentDiv);
                }
              }
        }
    }

    // This is our button for adding a user to the blacklist, it's only needed if we're on the forum page
    function addBlacklistButtonToPost(element, name) {
        let buttonElement = document.createElement("button");
        buttonElement.innerHTML = "Add to Blacklist";
        buttonElement.style.border = "none";
        buttonElement.style.backgroundColor = "lightcoral";
        buttonElement.style.fontSize = "14px";
        buttonElement.onclick = function () {
            let tempBlacklist = GM_getValue(blacklistedUsers_, []);
            if (tempBlacklist.includes(name)) {
                console.log(`${name} is already in the blacklist so removing post`);
            } else {
                tempBlacklist.push(name);
                GM_setValue(blacklistedUsers_, tempBlacklist);
                blacklistedUsers = tempBlacklist;
                console.log(`${name} added to the blacklist.`);
                location.reload();
            }
        };
        element.appendChild(buttonElement);
    }
    if(trackForumThreadPages){
        // This is for our forum page tracking
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const threadID = urlParams.get("id");
        const pageID = urlParams.get("pid");
        const currentPage = (pageID / 15) + 1;
        const settingValue = `thread_${threadID}`;

        // Get the array for the current thread
        let threadArray = getSetting(settingValue, []);

        // Check if the current page is already in that array
        if (!threadArray.includes(currentPage)) {
            threadArray.push(currentPage);
            GM_setValue(settingValue, threadArray);
        } else {
            console.log(`Page ${currentPage} is already in array`);
        }

        // We now need the paginator, luckily it's got an ID
        let paginatorElements = document.getElementById("paginator").querySelectorAll("a");
        for (const item of paginatorElements) {
            let itemInner = item.innerText.trim();
            if (!(itemInner.includes("<") || itemInner.includes(">")) && threadArray.includes(parseInt(itemInner))) {
                item.style.backgroundColor = "lightgreen";
            }
        }
    }
}



// We first wanna check if they're on the options page and if so, we'll add our custom settings to it
if (isPage_opt) {
    let vtbody = document.body.getElementsByTagName("tbody")[0];
    let vtfoot = document.body.getElementsByTagName("tfoot")[0];

    // We'll add a custom splitter in the table for our settings
    makeRow(
        "Kivl's Improvement Settings",
        "<h3>Below are the settings for Kivl's improvement script.</h3>",
        vtbody
    );

    /*
    * Global Settings
    */
    makeRow(
        "Global Settings",
        "These settings are applied to all pages.",
        vtbody
    );
    addToForm(
        "Receive mail notification",
        "Sends a desktop notification when you receive mail",
        vtbody,
        makeCB(receiveMailNotification_, receiveMailNotification),
        "True"
    );
    addToForm(
        "Mail check interval",
        "How often you want to check for new mail in seconds. Warning, you may get rate limited if you set this too low.",
        vtbody,
        makeNum(mailCheckInterval_, mailCheckInterval),
        "30"
    )

    /*
    * Navbar settings
    */
    makeRow(
        "Navbar Settings",
        "Below are the settings for the navbar.",
        vtbody
    )
    addToForm(
        "Inbox Link",
        "Adds an inbox link to the navbar",
        vtbody,
        makeCB(inboxLink_, inboxLink),
        "True"
    );
    addToForm(
        "My Account Dropdown",
        "Replaces the My Account link with a dropdown menu",
        vtbody,
        makeCB(myAccountLink_, myAccountLink),
        "True"
    );

    /*
    * Post settings
    */
    makeRow(
        "Post Settings",
        "Below are the settings for image/video posts.",
        vtbody
    );
    addToForm(
        "Open Posts in New Tab",
        "Opens posts in a new tab when you click on the thumbnail",
        vtbody,
        makeCB(openPostsInNewTab_, openPostsInNewTab),
        "True"
    );
    addToForm(
        "Use Arrow Keys to Browse Posts",
        "Lets you use the left and right arrows to go forwards and back through posts.",
        vtbody,
        makeCB(arrowKeysToMove_, arrowKeysToMove),
        "True"
    )

    /*
    * Forum Settings
    */

    makeRow(
        "Forums Settings",
        "Below are the settings for the forums.",
        vtbody
    )
    addToForm(
        "Scrub Forums",
        "Removes posts from blacklisted users",
        vtbody,
        makeCB(scrubForums_, scrubForums),
        "True"
    );
    addToForm(
        "Track Forum Thread Pages Viewed",
        "This'll keep track of what pages you view on a forum thread and mark them on the paginator",
        vtbody,
        makeCB(trackForumThreadPages_, trackForumThreadPages),
        "False"
    );
    addToForm(
        "Forum Relative Time",
        "Adds how long ago the post was made",
        vtbody,
        makeCB(forumRelativeTime_, forumRelativeTime),
        "True"
    );
    addToForm(
        "Forum Local Time",
        "Replaces the timestamp on forum posts with the local time",
        vtbody,
        makeCB(forumLocalTime_, forumLocalTime),
        "True"
    );
    addToForm(
        "Show Character Count",
        "Adds the character count of the post",
        vtbody,
        makeCB(showCharCount_, showCharCount),
        "True"
    )
    addToForm(
        "Scrub Posts with Max Length",
        "Removes posts that are longer than the max length",
        vtbody,
        makeCB(scrubMaxLength_, scrubMaxLength),
        "True"
    )
    addToForm(
        "Max Content Length",
        "The maximum length of a post in characters before it's removed. -1 for no limit.",
        vtbody,
        makeNum(maxContentLength_, maxContentLength),
        "1500"
    );
    addToForm(
        "Blacklisted Users",
        "Enter a list of usernames to remove from the forums. One per line. It ignores blank lines. It is case sensitive.",
        vtbody,
        makeTA(blacklistedUsers_, blacklistedUsers),
        "Empty"
    );
    addToForm(
        "Completely Hide Blacklisted Users",
        "Hides blacklisted users' posts entirely, doesn't even show the 'Show Anyway' prompt.",
        vtbody,
        makeCB(completelyHideBlacklist_, completelyHideBlacklist),
        "False"
    )

    // We now add another row to mark the end of our settings
    makeRow(
        "Kivl's Improvement Settings",
        "<h3>Above are the settings for Kivl's improvement script.</h3>",
        vtbody
    );

    // Add our custom backup button
    addBackupButton(vtfoot);
}

// Here's where we hold a bunch of our functions

// Strips HTML elements from text, used to get the character count of forum posts
function stripHtml(html) {
  let tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// Converts array to newline separated string
function arrayToString(array) {
  let string = "";
  for (let i = 0; i < array.length; i++) {
    string += array[i] + "\n";
  }
  // Remove the last newline
  string = string.substring(0, string.length - 1);
  return string;
}

// Converts newline separated string to array ignoring any empty strings
function stringToArray(string) {
  let array = string.split("\n");
  let newArray = [];
  for (let i = 0; i < array.length; i++) {
    if (array[i] != "") {
      newArray.push(array[i]);
    }
  }
  return newArray;
}

// Specifically for making options

// We'll make a function for creating checkboxes
function makeCB(setv_, setv) {
    let label = document.createElement("label");
    label.className = "checkboxContainer";
    let input = document.createElement("input");
    input.type = "checkbox";
    input.checked = GM_getValue(setv_, setv);
    input.addEventListener("change", function () {
        GM_setValue(setv_, this.checked);
        setv = this.checked;
    });
    let span = document.createElement("span");
    span.className = "checkmark";
    label.appendChild(input);
    label.appendChild(span);
    return label;
}

// We'll make a function for creating textareas
function makeTA(setv_, setv) {
    let textDiv = document.createElement("div");
    textDiv.className = "awesomplete";
    let textArea = document.createElement("textarea");
    // Set the textarea settings
    textArea.cols = 50;
    textArea.name = setv_;
    textArea.rows = 10;
    textArea.innerHTML = arrayToString(GM_getValue(setv_, setv));
    textArea.autocomplete = "off";
    textArea.addEventListener("change", function () {
        let array = stringToArray(this.value);
        GM_setValue(setv_, array);
        setv = array;
    });
    textDiv.appendChild(textArea);
    return textDiv;
}

// Custom number inputs
function makeNum(setv_, setv) {
    let label = document.createElement("label");
    label.className = "numberContainer";
    let input = document.createElement("input");
    input.type = "number";
    input.value = GM_getValue(setv_, setv);
    input.addEventListener("change", function () {
        GM_setValue(setv_, this.value);
        setv = this.value;
    });
    let span = document.createElement("span");
    span.className = "number";
    label.appendChild(input);
    label.appendChild(span);
    return label;
}

function addToForm(name, desc, vtbody, child, defaultValue = "") {
    let vtr = document.createElement("tr");
    let vth = document.createElement("th");
    let vlabel = document.createElement("label");
    vlabel.className = "block";
    vlabel.innerHTML = name;
    vth.appendChild(vlabel);
    let vp = document.createElement("p");
    vp.innerHTML = desc;
    vp.innerHTML += "<br><br> Default: " + defaultValue;
    vth.appendChild(vp);
    vtr.appendChild(vth);
    let vtd = document.createElement("td");
    vtd.appendChild(child);
    vtr.appendChild(vtd);
    vtbody.appendChild(vtr);
}

// Adds a filler row to a table
function makeRow(title, content, vtbody) {
    let headerTR = document.createElement("tr");
    let headerTH = document.createElement("th");
    let headerLabel = document.createElement("label");
    headerLabel.className = "block";
    headerLabel.innerHTML = title;
    headerTH.appendChild(headerLabel);
    headerTR.appendChild(headerTH);
    let headerTD = document.createElement("td");
    headerTD.innerHTML = "<strong>" + content;
    headerTR.appendChild(headerTD);
    vtbody.appendChild(headerTR);
}

// Adds our backup button
function addBackupButton(vtfoot) {
    let buttonTD = vtfoot.querySelector("td");
    let backupButton = document.createElement("button");
    backupButton.innerHTML = "Backup Script Settings";
    backupButton.title = "Saves the settings from the Kivl's Improvements script to disk in json format"
    backupButton.onclick = function() {
        saveSettingsToDisk();
    }
    buttonTD.appendChild(backupButton);
}

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
}

// Fancy time relativity system
function timeDifference(current, previous) {

    var msPerMinute = 60 * 1000;
    var msPerHour = msPerMinute * 60;
    var msPerDay = msPerHour * 24;
    var msPerMonth = msPerDay * 30;
    var msPerYear = msPerDay * 365;

    var elapsed = current - previous;

    if (elapsed < msPerMinute) {
        let numSeconds = Math.round(elapsed/1000);
        if (numSeconds == 1) {
            return numSeconds + ' second ago';
        }
        return numSeconds + ' seconds ago';
    }

    else if (elapsed < msPerHour) {
        let numMinutes = Math.round(elapsed/msPerMinute);
        if (numMinutes == 1) {
            return numMinutes + ' minute ago';
        }
        return numMinutes + ' minutes ago';
    }

    else if (elapsed < msPerDay ) {
        let numHours = Math.round(elapsed/msPerHour);
        if (numHours == 1) {
            return numHours + ' hour ago';
        }
        return numHours + ' hours ago';
    }

    else if (elapsed < msPerMonth) {
        let numDays = Math.round(elapsed/msPerDay);
        if (numDays == 1) {
            return numDays + ' day ago';
        }
        return numDays + ' days ago';
    }

    else if (elapsed < msPerYear) {
        let num = Math.round(elapsed/msPerMonth);
        if (num == 1) {
            return num + ' month ago';
        }
        return num + ' months ago';
    }

    else {
        let num = Math.round(elapsed/msPerYear);
        if (num == 1) {
            return num + ' year ago';
        }
        return num + ' years ago';
    }
}

function fixATags(initialLoad) {
    let imageListDiv;
    if (initialLoad) {
        imageListDiv = document.querySelectorAll("#post-list > div.content > div.image-list > span");
    } else {
        imageListDiv = document.querySelectorAll("#post-list > div.content > span");
    }

    for (const item of imageListDiv) {
        item.querySelector("a").setAttribute("target", "_blank");
    }
}

function checkPostID(postID, decrement) {
    let url = `https://rule34.xxx/index.php?page=post&s=view&id=${postID}`;
    GM_xmlhttpRequest ( {
        method:         "HEAD",
        url:            url,
        responseType:   "html",
        onload:         processResponseCode,
        context: {
            postID: postID,
            decrement: decrement
        }
    });

    function processResponseCode(rspObj) {
        if (url != rspObj.finalUrl) {
            let currentPostChecked = rspObj.context.postID;
            let decrement = rspObj.context.decrement;
            console.log(`${currentPostChecked} redirected us!`)
            // Decrement again and re-try
            if (decrement) {
                currentPostChecked--;
            } else {
                currentPostChecked++;
            }
            checkPostID(currentPostChecked, decrement);
        } else {
            window.location.href = url;
        }
    }
}
