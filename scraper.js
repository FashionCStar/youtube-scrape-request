const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');

async function youtube(query, key, pageToken) {
    return new Promise((resolve, reject) => {
        let json = { results: [], version: require('./package.json').version };

        // Specify YouTube search url
        if (key) {
            json["parser"] = "json_format.page_token";
            json["key"] = key;
            
            // Access YouTube search API
            request.post(`https://www.youtube.com/youtubei/v1/search?key=${key}`, {
                json: {
                    context: {
                        client: {
                            clientName: "WEB",
                            clientVersion: "2.20201022.01.01",
                        },
                    },
                    continuation: pageToken
                },
            }, (error, response, body) => {
                console.log("next page token body result");

                if (!error && response.statusCode === 200) {
                    parseJsonFormat(body.onResponseReceivedCommands[0].appendContinuationItemsAction.continuationItems, json);
                    return resolve(json);
                }
                resolve({ error: error });
            });
        }
        else {
            let url = `https://www.youtube.com/results?q=${encodeURIComponent(query)}`;

            // Access YouTube search
            request(url, (error, response, html) => {
                // Check for errors
                if (!error && response.statusCode === 200) {
                    const $ = cheerio.load(html);

                    // First attempt to parse old youtube search result style
                    $(".yt-lockup-dismissable").each((index, vid) => {
                        json["parser"] = "html_format";
                        json.results.push(parseOldFormat($, vid));
                    });

                    // If that fails, we have to parse new format from json data in html script tag
                    if (!json.results.length) {
                        json["parser"] = "json_format";
                        json["key"] = html.match(/"innertubeApiKey":"([^"]*)/)[1];

                        // Get script json data from html to parse
                        let data, sectionLists = [];
                        try {
                            let match = html.match(/ytInitialData"[^{]*(.*);\s*window\["ytInitialPlayerResponse"\]/s);
                            if (match && match.length > 1) {
                                json["parser"] += ".original";
                            }
                            else {
                                json["parser"] += ".scraper_data";
                                match = html.match(/ytInitialData[^{]*(.*);\s*\/\/ scraper_data_end/s);
                            }
                            data = JSON.parse(match[1]);
                            json["estimatedResults"] = data.estimatedResults || "0";
                            sectionLists = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
                        }
                        catch(ex) {
                            console.error("Failed to parse data:", ex);
                            console.log(data);
                        }

                        // Loop through all objects and parse data according to type
                        parseJsonFormat(sectionLists, json);
                    }
        
                    return resolve(json);
                }
                resolve({ error: error });
            });
        }
    });
};

/**
 * Parse youtube search results from dom elements
 * @param {CheerioStatic} $ - The youtube search results loaded with cheerio
 * @param {CheerioElement} vid - The current video being parsed
 * @returns object with data to return for this video
 */
function parseOldFormat($, vid) {
    // Get user details
    let $byline = $(vid).find(".yt-lockup-byline");
    // Get video details
    let $metainfo = $(vid).find(".yt-lockup-meta-info li");
    let $thumbnail = $(vid).find(".yt-thumb img");
    let video = {
        "id": $(vid).parent().data("context-item-id"),
        "title": $(vid).find(".yt-lockup-title").children().first().text(),
        "link": `https://www.youtube.com${$(vid).find(".yt-lockup-title").children().first().attr("href")}`,
        "duration": $(vid).find(".video-time").text().trim() || "Playlist",
        "snippet": $(vid).find(".yt-lockup-description").text(),
        "release_date": $metainfo.first().text(),
        "thumbnail_src": $thumbnail.data("thumb") || $thumbnail.attr("src"),
        "num_views": $metainfo.last().text(),
        "channel": $byline.text(),
        "channel_link": `https://www.youtube.com${$byline.find("a").attr("href")}`,
    };

    return video
}

/**
 * Parse youtube search results from json sectionList array and add to json result object
 * @param {Array} contents - The array of sectionLists
 * @param {Object} json - The object being returned to caller
 */
function parseJsonFormat(contents, json) {
    contents.forEach(sectionList => {
        try {
            if (sectionList.hasOwnProperty("itemSectionRenderer")) {
                sectionList.itemSectionRenderer.contents.forEach(content => {
                    try {
                        if (content.hasOwnProperty("videoRenderer")) {
                            json.results.push(parseVideoRenderer(content.videoRenderer));
                        }
                    }
                    catch(ex) {
                        console.error("Failed to parse renderer:", ex);
                        console.log(content);
                    }
                });
            }
            else if (sectionList.hasOwnProperty("continuationItemRenderer")) {
                json["nextPageToken"] = sectionList.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        }
        catch (ex) {
            console.error("Failed to read contents for section list:", ex);
            console.log(sectionList);
        }
    });
}

/**
 * Parse a videoRenderer object from youtube search results
 * @param {object} renderer - The video renderer
 * @returns object with data to return for this video
 */
function parseVideoRenderer(renderer) {
    let video = {
        "id": renderer.videoId,
        "link": `https://www.youtube.com${renderer.navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "thumbnail_src": renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url,
        "title": renderer.title.runs.reduce(comb, ""),
        "duration": renderer.lengthText ? renderer.lengthText.simpleText : "Live",
        "snippet": renderer.descriptionSnippet ?
                   renderer.descriptionSnippet.runs.reduce((a, b) => a + (b.bold ? `<b>${b.text}</b>` : b.text), ""):
                   "",
        "channel": renderer.ownerText.runs[0].text,
        "channel_link": `https://www.youtube.com${renderer.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "release_date": renderer.publishedTimeText ? renderer.publishedTimeText.simpleText : "Live",
        "num_views": renderer.viewCountText ?
            renderer.viewCountText.simpleText || renderer.viewCountText.runs.reduce(comb, "") :
            (renderer.publishedTimeText ? "0 views" : "0 watching")
    };

    return video
}

/**
 * Combine array containing objects in format { text: "string" } to a single string
 * For use with reduce function
 * @param {string} a - Previous value
 * @param {object} b - Current object
 * @returns Previous value concatenated with new object text
 */
function comb(a, b) {
    return a + b.text;
}

module.exports.youtube = youtube;