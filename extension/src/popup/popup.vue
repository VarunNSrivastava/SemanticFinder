<template>
    <div id="app" :class="popupClass">

        <div v-if="!isModelLoaded" class="progress-container">
            <!--todo: make this its own vue component-->
            <div class="progress-background">
                <div class="progress-bar" :style="{ width: progressValue + `%`}"></div>
            </div>
            <div class="loading-text">Loading model</div>
        </div>

        <div v-else>
            <div v-if="error" class="error">
                <span class="dismiss" @click="dismissError">&#x2612;</span>
                ERROR: {{ error }}
            </div>
            <AnimatedInput ref="input"></AnimatedInput>

            <!-- Display results and progress only if popupClass is 'popup-expanded' -->
            <div v-if="popupClass === 'popup-expanded'">
                <div class="results-container">
                    <ResultItem
                            v-for="(result, index) in results"
                            :key="index"
                            :result="result.text"
                            :score="result.sim"
                            @click="handleResultClick(result)"
                    />
                </div>

                <div class="progress-container search-progress">
                    <div class="progress-bar" :style="{ width: searchProgress + `%` }"></div>
                </div>

            </div>
        </div>


    </div>
</template>


<script>

import ResultItem from './result.vue';
import AnimatedInput from './AnimatedInput.vue'
import {prettyLog} from "../utils/utils.js";

export default {
    components: {
        AnimatedInput,
        ResultItem,
    },
    data() {
        return {
            results: [],
            progressValue: 0,
            searchProgress: 0,
            isModelLoaded: false,
            error: undefined,
        };
    },
    computed: {
        popupClass() {
            return this.results.length > 0 ? 'popup-expanded' : 'popup-default';
        },
    },
    watch: {},
    methods: {
        async handleMessage(request, sender, sendResponse) {
            // console.dir(request);
            switch (request.type) {
                case "results":
                    if ('text' in request) {
                        this.results = request.text;
                    }
                    this.searchProgress = request.progress;

                    break;
                case "download":
                    if (request.data.file && request.data.file !== "onnx/model_quantized.onnx") {
                        break;
                    }
                    if (request.data.status === 'progress') {
                        this.progressValue = request.data.progress.toFixed(2);
                    } else if (request.data.status === 'complete') {
                        this.progressValue = 100;
                        this.isModelLoaded = true;
                    }
                    break;
                case "error":
                    this.error = request.reason;
            }
        },

        // todo: move to result.vue
        handleResultClick(result) {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: 'highlightAndScroll', text: result.text});
            });
        },
        dismissError() {
            this.error = null;
        },
    },

    async mounted() {
        chrome.runtime.onMessage.addListener(this.handleMessage);
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return document.contentType;
      },
    });

    chrome.tabs.sendMessage(tab.id, {
      type: "getText",
      contentType: res.result,
    });
        chrome.runtime.sendMessage({type: "load"});

        this.results = [];

    },
    beforeUnmount() {
        this.results = [];
        chrome.runtime.sendMessage({type: "pruneEmbeddings"});
        chrome.runtime.onMessage.removeListener(this.handleMessage);
    },
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap');


#app {
    padding: 0;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
}

#app.popup-default {
    width: 150px;
    transition: width 0.5s ease;
}

#app.popup-expanded {
    width: 300px;
    transition: width 0.5s ease;
}

.progress-container {
    position: relative;
}


.loading-text {
    color: white;
    font-size: 12px;
    font-family: 'Space Mono', 'monospace';
    font-weight: 700;
    position: absolute;
    z-index: 2;
    white-space: nowrap;
    overflow: hidden;

    top: 50%;
    transform: translateY(-50%);
    left: 7.5px;

    text-shadow: -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000;
}


.progress-background {
    width: 140px;
    height: 30px;
    background-color: black;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    padding: 0 5px;
}


.progress-bar {
    height: 22px;
    background-color: #525252;
    clip-path: polygon(0 0, 75% 0, 100% 100%, 0 100%);
    z-index: 2;
}


.results-container {
    max-height: 400px;
    width: 290px;
    overflow-y: auto;
    padding: 10px;
}

.progress-container.search-progress >>> .progress-bar {
    height: 12px;
    background-color: #525252;
    color: #525252;
    clip-path: none;
}

.progress-bar[style*="100%"] {
    clip-path: none;
}

.error {
    font-family: 'Space Mono', 'monospace';
    background: red;
    color: white;
    z-index: 3;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    font-size: 11px;
    line-height: 1;
    padding: 15px 10px 10px 10px;  /* Adjust as needed */
}


.dismiss {
    position: absolute;
    top: 0px;
    left: 8px;
    cursor: pointer;
    font-weight: bold;
    font-size: 28px;
}

</style>
