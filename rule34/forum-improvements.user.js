// ==UserScript==
// @name         Rule34.xxx: Forum improvements
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Various forum improvements
// @author       You
// @match        https://rule34.xxx/index.php?page=forum&s=view*
// @match        https://rule34.xxx/index.php?page=account&s=options
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

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

// Enable/disable scrubbing the forums.
// Currently no way of actually toggling it
var scrubForums_ = "scrubForums";
var scrubForums = getSetting(scrubForums_, true);

// Blacklisted list of users
var blacklistedUsers_ = "blacklistedUsers";
var blacklistedUsers = getSetting(blacklistedUsers_, []);

// Our setting getting function
function getSetting(settingName, settingDefault) {
  let value = GM_getValue(settingName, null);
  if (value == null) {
    GM_setValue(settingName, settingDefault);
    value = settingDefault;
  }
  return value;
}

// Checking correct pages
let isPage_opt = document.location.href.includes(
  "index.php?page=account&s=options"
);

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

// Then we'll need one for modifying the form
function makeCB_form(setv_, setv, name, desc, vtbody) {
  let vtr = document.createElement("tr");
  let vth = document.createElement("th");
  let vlabel = document.createElement("label");
  vlabel.className = "block";
  vlabel.innerHTML = name;
  vth.appendChild(vlabel);
  let vp = document.createElement("p");
  vp.innerHTML = desc;
  vth.appendChild(vp);
  vtr.appendChild(vth);
  let vtd = document.createElement("td");
  vtd.appendChild(makeCB(setv_, setv));
  vtr.appendChild(vtd);
  vtbody.appendChild(vtr);
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

// Then we'll need one for modifying the form
function makeTA_form(setv_, setv, name, desc, vtbody) {
  let vtr = document.createElement("tr");
  let vth = document.createElement("th");
  let vlabel = document.createElement("label");
  vlabel.className = "block";
  vlabel.innerHTML = name;
  vth.appendChild(vlabel);
  let vp = document.createElement("p");
  vp.innerHTML = desc;
  vth.appendChild(vp);
  vtr.appendChild(vth);
  let vtd = document.createElement("td");
  vtd.appendChild(makeTA(setv_, setv));
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
  headerTD.innerHTML = content;
  headerTR.appendChild(headerTD);
  vtbody.appendChild(headerTR);
}

// Adding our custom stuff to the options page
if (isPage_opt) {
  console.log("On the options page");
  let vtbody = document.body.getElementsByTagName("tbody")[0];

  // We'll add a custom splitter in the table for our settings
  makeRow(
    "Kivl's Improvement Settings",
    "<h3>Below are the settings for Kivl's improvement script.</h3>",
    vtbody
  );

  // All our custom checkboxes
  makeCB_form(
    scrubForums_,
    scrubForums,
    "Scrub Forums",
    "Removes posts from blacklisted users",
    vtbody
  );

  // All our custom textareas
  makeTA_form(
    blacklistedUsers_,
    blacklistedUsers,
    "Blacklisted Users",
    "Enter a list of usernames to remove from the forums. One per line. It ignores blank lines. It is case sensitive.",
    vtbody
  );

  // We now add another row to mark the end of our settings
  makeRow(
    "Kivl's Improvement Settings",
    "<h3>Above are the settings for Kivl's improvement script.</h3>",
    vtbody
  );
} else {
  let blacklist = blacklistedUsers;
    console.log(blacklist);

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
        blacklist = tempBlacklist;
        console.log(`${name} added to the blacklist.`);
        location.reload();
      }
    };
    element.appendChild(buttonElement);
  }

  let elements = document
    .getElementById("forum")
    .querySelectorAll("div.author");
  for (const item of elements) {
    // Get the name of the poster
    let nameElement = item.querySelectorAll("h6 > a:nth-child(2)")[0];
    let name = nameElement.innerHTML;

    // The parent, which is the entire post's div
    let parent = item.parentElement;

    // Content length stuff
    let content = parent.querySelectorAll("div.content > div.body")[0];
    let contentLength = stripHtml(content.innerHTML).length;
    let contentLengthElement = document.createElement("span");
    contentLengthElement.innerHTML = `<br>${contentLength} characters`;
    contentLengthElement.setAttribute("class", "date");
    item.appendChild(contentLengthElement);

    // Adds our blacklist button
    addBlacklistButtonToPost(item, name);

    // Removes post if it's in the blacklist or over 1500 chars
    if (blacklist.includes(name) || contentLength == 1) {
      if (scrubForums) {
        console.log("Found post by " + name + ". Removing.");
        parent.remove();
      }
    } else {
        console.log(`${name} not in blacklist.`);
    }
  }
}
