import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/addon/search/searchcursor.js';

import { loadSemantic, similarity, getTokens } from './semantic.js';

import '../css/styles.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'codemirror/lib/codemirror.css';

let markers = [];
let editor;
let submitTime = 0;
let isProcessing = false;
let selectedIndex = -1;
let selectedClassName;
let prevCard;
const nextButton = document.getElementById("next");
const prevButton = document.getElementById("prev");
const progressBar = document.getElementById("progressBar");
const progressBarProgress = document.getElementById("progressBarProgress");
const submitButton = document.getElementById("submit_button");

function removeHighlights() {
    for (let marker of markers) {
        marker.clear();
    }
    markers = [];
}

function activateSubmitButton() {
    // get references to the loading element and submit button
    if (submitButton) {
        setTimeout(function() {
            submitButton.removeAttribute("disabled");
            submitButton.textContent = "Submit";
        }, 3000);


    }
}

function finishCallback() {
    submitButton.textContent = "Submit";
    isProcessing = false;
    const processTime = new Date().getTime() - submitTime;
    console.log(`Finished ${processTime}ms`);

    activateScrollButtons();
}

async function onSubmit() {
    if (!isProcessing) {
        submitTime = new Date().getTime();
        isProcessing = true;
        submitButton.textContent = "Stop";

        document.getElementById('results-list').innerHTML = '';
        selectedIndex = -1;
        await semanticHighlight(finishCallback);
    } else {
        submitButton.textContent = "Submit"
        isProcessing = false;
    }
}

function updateResults(results) {
    const threshold = document.getElementById("threshold").value;
    // Remove previous highlights
    removeHighlights();

    // Get results list element
    let resultsDiv = document.getElementById('results-list');
    resultsDiv.innerHTML = '';

    for (let i = 0; i < results.length; i++) {
        let resultItem = results[i];
        if (resultItem[1] < threshold) { break; } // redundant

        let highlightClass;
        if (i === 0) highlightClass = "highlight-first";
        else if (i === 1) highlightClass = "highlight-second";
        else highlightClass = "highlight-third";

        createHighlight(resultItem[0], highlightClass, resultItem[1]);

    }
}

function createHighlight(text, className, similarity) {
    let resultsDiv = document.getElementById('results-list');
    const cursor = editor.getSearchCursor(text);

    while (cursor.findNext()) {
        let marker = editor.markText(cursor.from(), cursor.to(), { className: className });
        markers.push(marker);

        // create card
        let listItem = document.createElement('div');
        listItem.classList.add('card');
        listItem.innerHTML = createCardHTML(text, similarity);

        resultsDiv.appendChild(listItem);

        let index = resultsDiv.childElementCount - 1;

        // Add click listener for card
        listItem.addEventListener('click', function () {
            editor.scrollIntoView(markers[index].find());
            highlightSelected(index);
        });
    }
}

function createCardHTML(title, similarity) {
    return `
        <div class="card-body">
            <h5 class="card-title">${title}</h5>
            <h6 class="card-subtitle mb-2 text-muted">similarity: ${similarity.toFixed(2)}</h6>
        </div>
    `;
}

function highlightSelected(index) {
    highlightCard(index);
    if (selectedIndex !== -1) {
        let marker0 = editor.markText(markers[selectedIndex].find().from, markers[selectedIndex].find().to, { className: selectedClassName });
        markers[selectedIndex].clear();
        markers[selectedIndex] = marker0;
    }

    selectedIndex = index;
    selectedClassName = markers[selectedIndex].className;

    let marker1 = editor.markText(markers[selectedIndex].find().from, markers[selectedIndex].find().to, { className: "highlight-select" });
    markers[selectedIndex].clear();
    markers[selectedIndex] = marker1;
}

function highlightCard(index) {
    let resultsDiv = document.getElementById('results-list');
    let cards = resultsDiv.getElementsByClassName('card');

    // Ensure the index is within the range of the cards.
    if (prevCard) {
        prevCard.style.backgroundColor = '';
    }
    prevCard = cards[index];
    cards[index].style.backgroundColor = '#f4ac90';
}

function resetHighlightsProgress() {
    // clear any highlights
    removeHighlights();
    progressBar.value = 0;
    progressBarProgress.textContent = 0;

}


async function semanticHighlight(callback) {
    deactivateScrollButtons();
    resetHighlightsProgress();

    // query input embedding
    const text = editor.getValue("");
    const inputQuery = document.getElementById("query-text").value;

    let inputTexts = await splitText(text);

    let results = [];
    let max = inputTexts.length;

    let i = 0;

    // all are set into play async then function continues
    let interval = setInterval(async () => {
        let inputText = inputTexts[i];
        if (i >= max || !isProcessing) {
            clearInterval(interval);
            callback();
            return;
        }
        i++;

        const cosineSimilarity = await similarity(inputText, inputQuery);

        results.push([inputText, cosineSimilarity]);
        results.sort((a, b) => b[1] - a[1]);

        updateResults(results);
        if (markers.length > 0 && (selectedIndex === -1 || selectedIndex === 0)) {
            editor.scrollIntoView(markers[0].find());
        }

        // update progress bar
        let progress = Math.round((i * 100) / max);
        progressBar.value = progress;
        progressBarProgress.textContent = progress;

    }, 0);
}


async function splitText(text) {
    const splitType = document.getElementById('split-type').value;
    const splitParam = document.getElementById('split-param').value;

    switch(splitType) {
        case 'Regex':
            return splitByRegex(text, splitParam);
        case 'Sentence':
            return splitBySentences(text);
        case 'Words':
            return splitByWords(text, parseInt(splitParam));
        case 'Chars':
            return splitByChars(text, parseInt(splitParam));
        case 'Tokens':
            return await splitByTokens(text, parseInt(splitParam));
        default:
            console.error('Invalid split type');
            return null;
    }
}

async function splitByTokens(str, numTokens) {
    const words = str.split(' ');
    const chunks = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const tokens = await getTokens(word);

        // Check if there's no chunk or if the last chunk + the new word would exceed numTokens
        if (chunks.length === 0 || (await getTokens(chunks[chunks.length - 1])).length + tokens.length > numTokens) {
            chunks.push(word);
        } else {
            chunks[chunks.length - 1] += ' ' + word;
        }
    }
    console.table(chunks);
    return chunks;
}


function splitByWords(str, numWords) {
    if (isNaN(numWords) || !Number.isInteger(numWords)) {
        console.error("numWords must be an integer.");
        return null;
    }

    const words = str.split(" ");
    const chunks = [];

    let currentChunk = [];
    for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);

        if (currentChunk.length === numWords) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    console.table(chunks);
    return chunks;
}


function splitByChars(str, numChars) {
    const words = str.split(' ');
    const chunks = [];

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        if (chunks.length === 0 || chunks[chunks.length - 1].length + word.length + 1 > numChars) {
            chunks.push(word);
        } else {
            chunks[chunks.length - 1] += ' ' + word;
        }
    }
    console.table(chunks);

    return chunks;
}


function splitBySentences(text) {
        return text.match(/[^\.!\?]+[\.!\?]+/g);
    }

function splitByRegex(str, r) {
    let regex = new RegExp(r, 'g');
    return str.split(regex);
}


function activateScrollButtons() {
    // Enable the next and prev buttons
    if (nextButton) {
        nextButton.removeAttribute("disabled");
    }

    if (prevButton) {
        prevButton.removeAttribute("disabled");
    }
}

function deactivateScrollButtons() {
    // Disable the next and prev buttons
    if (nextButton) {
        nextButton.setAttribute("disabled", "");
    }

    if (prevButton) {
        prevButton.setAttribute("disabled", "");
    }
}

function setup() {
    document.addEventListener('DOMContentLoaded', (event) => {
        document.getElementById('split-type').addEventListener('change', function() {
            // Get the selected option value
            var selectedValue = this.value;
            const split_param = document.getElementById('split-param')

            switch (selectedValue) {
                case "Words":
                    split_param.disabled = false;
                    document.querySelector("label[for='split-param']").textContent = "# Words";
                    split_param.type = 'number';
                    split_param.value = 7;
                    split_param.min = 1;
                    break;
                case "Tokens":
                    split_param.disabled = false;
                    document.querySelector("label[for='split-param']").textContent = "# Tokens";
                    split_param.type = 'number';
                    split_param.value = 15;
                    split_param.min = 1;
                    split_param.max = 512;
                    console.groupEnd();
                    break;
                case "Chars":
                    split_param.disabled = false;
                    document.querySelector("label[for='split-param']").textContent = "# Chars";
                    split_param.type = 'number';
                    split_param.value = 40;
                    split_param.min = 1;
                    break;
                case "Regex":
                    split_param.disabled = false;
                    document.querySelector("label[for='split-param']").textContent = "Regex";
                    split_param.type = 'text';
                    split_param.value = "[.,]\\s";
                    break;
                default:
                    split_param.value = null;
                    split_param.disabled = true;
                    document.querySelector("label[for='split-param']").textContent = "";
                    split_param.placeholder = "";
            }
        });
    });

}

async function main() {
    setup();
    await loadSemantic();
    activateSubmitButton();

}
main();

function nextMarker() {
    if (selectedIndex === -1) {
        highlightSelected(0);

    } else {
        highlightSelected((selectedIndex + 1) % markers.length);
        editor.scrollIntoView(markers[selectedIndex].find());
    }
}

function prevMarker() {
    if (selectedIndex === -1) {
        highlightSelected(0);

    } else {
        highlightSelected((selectedIndex - 1 + markers.length) % markers.length);
        editor.scrollIntoView(markers[selectedIndex].find());
    }
}

/**
 * Setup the application when the page loads.
 */
window.onload = async function () {
    window.onSubmit = onSubmit;

    editor = CodeMirror.fromTextArea(document.getElementById('input-text'), {
        lineNumbers: true,
        mode: 'text/plain',
        matchBrackets: true,
        lineWrapping: true,
    });

    await loadSemantic();
    activateSubmitButton();

    document.getElementById('next').addEventListener('click', function (event) {
        event.preventDefault();
        nextMarker();
    });

    window.addEventListener('prev', function (event) {
        event.preventDefault();
        prevMarker();
    });
};

