// ==UserScript==
// @name         Rule34.xxx: Better forum timestamps
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds relative timestamps to the forums posts and converts the timestamp to local time
// @author       Kivl/mja00
// @match        https://rule34.xxx/index.php?page=forum&s=view*
// @icon         https://www.google.com/s2/favicons?domain=rule34.xxx
// @grant        none
// ==/UserScript==

let dateOptions = {year: 'numeric', month: 'numeric', day: 'numeric', minute: 'numeric', hour: 'numeric' };
let currentTime = new Date();

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

(function() {
    'use strict';

    let elements = document.getElementById("forum").querySelectorAll("div.author");
    for (const item of elements) {
        // Date related information about the post
        let dateElement = item.querySelector("span");
        let dateStringFull = dateElement.innerHTML;
        let dateAMOrPM = dateStringFull.slice(-3);
        let dateString = dateStringFull.slice(0, -3) + ":00 " + dateAMOrPM + " UTC";
        let date = new Date(dateString);
        dateElement.innerHTML = date.toLocaleDateString("en-US", dateOptions);
        dateElement.innerHTML += "<br>" + timeDifference(currentTime, date);
    }
})();
