
if (!chrome.runtime) {
    // Chrome 20-21
    chrome.runtime = chrome.extension;
} else if(!chrome.runtime.onMessage) {
    // Chrome 22-25
    chrome.runtime.onMessage = chrome.extension.onMessage;
    chrome.runtime.sendMessage = chrome.extension.sendMessage;
    chrome.runtime.onConnect = chrome.extension.onConnect;
    chrome.runtime.connect = chrome.extension.connect;
}

var timer=0;
var timerInst;
var isWaitingTimer = false;
var isAppClosed = false;

// content of blocker
var mainMessage="You shall not pass!";

var currentTab = undefined;
var isCheckingReload = false;

var ignore = [
    "www",
    "m",
    "cn"
];

// var singleHardLock = [];
var singleSoftLock = [];
var singleWhite = [];

var softLockList = [];
// var hardLockList = [];
var whiteList = [];

// this only record time except this time you browse
var softTimeRecord = {};
var whiteTimeRecord = {};
var totalTimeRecordNew=0;
var totalTimeRecord=0;

// this only record this time browse, i.e. on-store stage
var softTimeRecordNew = {};
var whiteTimeRecordNew = {};

// store only today data
/**
 * this use dictionary cuz not guaranteed that every website will be surfed every day
 */
var todayWhiteTimeRecord = {};
var todaySoftTimeRecord = {};
var todayWhiteTotalTimeRecord=0;
var todaySoftTotalTimeRecord=0;
var todayTotalTimeRecord=0;


var purifiedSoftLock;
//var purifiedHardLock;
var purifiedWhite;

function init(){
    
    // get remain time of today, then force saveFully and set local data to 0 when times up.
    setChangeDayTimer();
    
    loadBlocker();
    loadFile();
}
init();

var changeDayTimerInst;

function setChangeDayTimer() {
    var now = new Date();
    var tomorrow = new Date();
    tomorrow.setDate(now.getDate()+1);
    tomorrow.setHours(0);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);
    tomorrow.setMilliseconds(0);

    var timeDiff = tomorrow.getTime() - now.getTime();

    // too close to change day, might be dangerous wait next time
    if(timeDiff<1000){
        changeDayTimerInst=setInterval(function () {
            clearInterval(changeDayTimerInst);
            setChangeDayTimer();
        },1005);
    }
    else{
        changeDayTimerInst=setInterval(function () {
            clearInterval(changeDayTimerInst);
            var day = new Date();
            console.log("saveFully at "+day.getMonth()+"/"+day.getDate()+'||'+day.getSeconds()+'.'+day.getMilliseconds());
            saveFileFully(function () {
                console.log("saveFully complete at "+day.getMonth()+"/"+day.getDate()+'||'+day.getSeconds()+'.'+day.getMilliseconds());
                clearLocalData();
                loadFile();
            });
            setChangeDayTimer();
        },timeDiff-5);
    }

}

function purifyBlackAndWhite(callback){
    var i;

    // for(i=0;i<singleHardLock.length;i++){
    //     singleHardLock[i] = cutOffHeadAndTail(singleHardLock[i]);
    // }
    for(i=0;i<singleSoftLock.length;i++){
        singleSoftLock[i] = cutOffHeadAndTail(singleSoftLock[i]);
    }
    for(i=0;i<singleWhite.length;i++){
        singleWhite[i] = cutOffHeadAndTail(singleWhite[i]);
    }

    // purifiedHardLock = new Array(hardLockList.length);
    // for(i=0;i<hardLockList.length;i++){
    //     purifiedHardLock[i] = purifyUrl(hardLockList[i]);
    // }
    purifiedSoftLock = new Array(softLockList.length);
    for(i=0;i<softLockList.length;i++){
        purifiedSoftLock[i] = purifyUrl(softLockList[i]);
    }
    purifiedWhite = new Array(whiteList.length);
    for(i=0;i<whiteList.length;i++){
        purifiedWhite[i] = purifyUrl(whiteList[i]);
    }

    if(callback) callback();
}

function isInList(mstr, lstr){
    // l=list, m=mine
    var sL = lstr.split("/");
    var sM = mstr.split("/");
    var i,j,k;

    if(sL.length==sM.length){
        if(sL[0]!=sM[0]){
            return false;
        }
        for(i=1;i<sL.length;i++){
            var conL = [];
            var conM = [];
            var cursor;
            // split item by special characters which is not Eng_char or number
            cursor = 0;
            for(j=0;j<sL[i].length;j++){
                if( (sL[i][j]>='a'&&sL[i][j]<='z') ||
                    (sL[i][j]>='A'&&sL[i][j]<='Z') ||
                    (sL[i][j]>='0'&&sL[i][j]<='9')){
                    // not special;
                }
                else{
                    conL.push(sL[i].substring(cursor,j));
                    cursor = j+1;
                }
            }
            conL.push(sL[i].substring(cursor,j));
            cursor = 0;
            for(j=0;j<sM[i].length;j++){
                if( (sM[i][j]>='a'&&sM[i][j]<='z') ||
                    (sM[i][j]>='A'&&sM[i][j]<='Z') ||
                    (sM[i][j]>='0'&&sM[i][j]<='9')){
                    // not special;
                }
                else{
                    conM.push(sM[i].substring(cursor,j));
                    cursor = j+1;
                }
            }
            conM.push(sM[i].substring(cursor,j));

            // if M contains all L item, then match count ++
            // Or, they are different
            var isIn;
            for(j=0;j<conL.length;j++){
                isIn = false;
                for(k=0;k<conM.length;k++){
                    if(conL[j]==conM[k]) isIn = true;
                }
                if(isIn==false) return false;
            }
        }

        // exactly match without interruption
        return true;

    }
    // not about time to judge
    return false;
}

/**
 * cut current searching URL and compare to each stored list item
 * TODO: remove comparable object from list each time case not match
 * @param str
 * @returns {boolean}
 */

function checkBlock(purified, cutted){
    var temp = purified;
    var i;

    // search single page first
    for(i=0;i<singleWhite.length;i++){
        if(cutted==singleWhite[i]) return 0;
    }
    // for(i=0;i<singleHardLock.length;i++){
    //     if(cutted == singleHardLock[i]) return 1;
    // }
    for(i=0;i<singleSoftLock.length;i++){
        if(cutted == singleSoftLock[i]) return 2;
    }

    // search in domain
    do{
        // search white first
        for(i=0;i<purifiedWhite.length;i++){
            if(isInList(temp,purifiedWhite[i])==true) return 0;
        }
        // search block
        // for(i=0;i<purifiedHardLock.length;i++){
        //     if(isInList(temp,purifiedHardLock[i])==true) return 1;
        // }
        for(i=0;i<purifiedSoftLock.length;i++){
            if(isInList(temp,purifiedSoftLock[i])==true) return 2;
        }
    }while( (temp = clearLast(temp))!="" );

    return -1;
}

/**
 * get current url, purify it
 *  and check in black and white list to judge whether need process
 */
function dealingUrl(tab,callback){
    //getCurrentTabUrl(function(url) {

        if(tab==undefined || tab.url==undefined) return false;
        var url = tab.url;

        purifyBlackAndWhite();

        var purified = purifyUrl(url);
        var cutted = cutOffHeadAndTail(url);

        var isBad = checkBlock(purified,cutted);

        // console.log("block? " + isBad);
        // console.log("hardBlock: " + hardLockList.toString());
        // console.log("softBlock: " + softLockList.toString());
        // console.log("whites: " + whiteList.toString());
        //
        // console.log("hardBlockSingle: " + singleHardLock.toString());
        // console.log("softBlockSingle: " + singleSoftLock.toString());
        // console.log("whitesSingle: " + singleWhite.toString());

        // if(isBad==1){
        //     chrome.tabs.sendMessage(tab.id, {block: "hard"}, function(response) {
        //         //console.log("send message to " + tab.url + " id = " + tab.id);
        //     });
        // }
        // else 
        if(isBad==2){

            if(isWaitingTimer==true || isAppClosed==true){
                chrome.tabs.sendMessage(tab.id, {block: "false"}, function(response) {
                    //console.log("send message to " + tab.url + " id = " + tab.id);
                });
                return;
            }

            chrome.tabs.sendMessage(tab.id, {block: "soft"}, function(response) {
                //console.log("send message to " + tab.url + " id = " + tab.id);
            });
        }
        else{
            chrome.tabs.sendMessage(tab.id, {block: "false"}, function(response) {
                //console.log("send message to " + tab.url + " id = " + tab.id);
            });
        }

        if(callback) callback();

    //});
}

chrome.extension.onMessage.addListener(function(msg, sender, sendResponse) {
    /**
     * content script request for data for any reason
     */
    if (msg && msg.blockerLoadRequest == "giveMeData") {
        loadBlocker();
        sendResponse({"mainMessage":mainMessage.toString()});
    }
    /**
     * popup script request modify main message
     */
    else if(msg && msg.modifyMainMessage!=undefined){
        mainMessage = msg.modifyMainMessage;
        saveBlocker(function(){
            // getCurrentTab(function(tab){
            //     chrome.tabs.reload(tab.id);
            // });
        });
    }
    /**
     * content script request bg script stop sending soft block for 5 min
     */
    else if(msg.wait5Min!=undefined){
        // isWaitingTimer = true;
        // var i = setInterval(function(){
        //     clearInterval(i);
        //     isWaitingTimer = false;
        //     getCurrentTab(dealWithUrlMain);
        // },10000);
        setTimer(300,function(){
            getCurrentTab(dealWithUrlMain);
        });
        getCurrentTab(dealWithUrlMain);
        return false;
    }
    /**
     * content script request for main message for any reason
     */
    else if(msg.getCurrentMainMessage!=undefined){
        sendResponse({mainMessage:mainMessage.toString()});
        //console.log("send main message : " + mainMessage.toString());
    }
    else if(msg.checkIfInList){
        checkIfReload(function(needReload){
            if(needReload){
                loadFile(function () {
                    if(msg.checkIfInList=="none"){
                        getCurrentTabUrl(function(url){
                            doCheckIfInList(url,sendResponse);
                        });
                    }
                    else{
                        var url = msg.checkIfInList;
                        doCheckIfInList(url,sendResponse);
                    }
                });
            }
            else{
                if(msg.checkIfInList=="none"){
                    getCurrentTabUrl(function(url){
                        doCheckIfInList(url,sendResponse);
                    });
                }
                else{
                    var url = msg.checkIfInList;
                    doCheckIfInList(url,sendResponse);
                }
            }
        });
    }
    else if(msg && msg.deleteRule){
        var sp = msg.deleteRule.split("::");
        var index;
        purifyBlackAndWhite();
        if(sp[0]=="singleWhite"){
            index = singleWhite.indexOf(sp[1]);
            singleWhite.splice(index,1);
            saveFile(getCurrentTab(dealWithUrlMain));
        }
        else if(sp[0]=="whiteList"){
            index = purifiedWhite.indexOf(sp[1]);
            whiteList.splice(index,1);
            saveFile(getCurrentTab(dealWithUrlMain));
            purifyBlackAndWhite();
        }
        else if(sp[0]=="singleSoftLock"){
            index = singleSoftLock.indexOf(sp[1]);
            singleSoftLock.splice(index,1);
            saveFile(getCurrentTab(dealWithUrlMain));
        }
        else if(sp[0]=="softLockList"){
            index = purifiedSoftLock.indexOf(sp[1]);
            softLockList.splice(index,1);
            saveFile(getCurrentTab(dealWithUrlMain));
            purifyBlackAndWhite();
        }
        // else if(sp[0]=="singleHardLock"){
        //     index = singleHardLock.indexOf(sp[1]);
        //     singleHardLock.splice(index,1);
        //     saveFile(getCurrentTab(dealWithUrlMain));
        // }
        // else if(sp[0]=="hardLockList"){
        //     index = hardLockList.indexOf(sp[1]);
        //     hardLockList.splice(index,1);
        //     saveFile(getCurrentTab(dealWithUrlMain));
        // }
    }
    else if(msg && msg.timerSet){
        setTimer(msg.timerSet*60,function(){
            getCurrentTab(dealWithUrlMain);
        });
        getCurrentTab(dealWithUrlMain);
        return false;
    }
    else if(msg && msg.getTimerTime){
        sendResponse({time:timer});
    }
    else if(msg && msg.cancelTimer){
        timer = 0;
        clearInterval(timerInst);
        getCurrentTab(dealWithUrlMain);
    }
    else if(msg && msg.isAppClosed){
        if(isAppClosed){
            sendResponse({isAppClosed:"true"});
        }
        else{
            sendResponse({isAppClosed:"false"});
        }
    }
    else if(msg && msg.changeAppStatus){
        if(msg.changeAppStatus=="open"){
            isAppClosed = false;
        }
        else{
            isAppClosed = true;
        }
    }
        // only run this while user see chart
        //   add time to current page cuz user will feel happy if they see the chart is moving
    else if(msg && msg.forceSaveFully){
        getCurrentTab(function(tab){
            console.log("force");
            doTimeRecord(tab);
            sendResponse({none:"none"});
        });
    }
    // else if(msg && msg.resetAllStatistics){
    //     var i;
    //     for(i=0;i<whiteTimeRecord.length;i++) whiteTimeRecord[i] = 0;
    //     for(i=0;i<whiteTimeRecordNew.length;i++) whiteTimeRecordNew[i] = 0;
    //     for(i=0;i<softTimeRecord.length;i++) softTimeRecord[i] = 0;
    //     for(i=0;i<softTimeRecordNew.length;i++) softTimeRecordNew[i] = 0;
    //     totalTimeRecord = 0;
    //     totalTimeRecordNew = 0;
    //     saveFileFully();
    // }
    else if(msg && msg.leavePage){
        console.log("on leave");
        doTimeRecord("tabUrl",msg.leavePage);
        currentPage = "null";
        sendResponse({none:"none"});

    }
    else if(msg && msg.resumePage){
        // discard prev cuz user not using browser at that time
        currentPageLoadTime = getCurrentTime();
        currentPage = msg.resumePage;
        sendResponse({none:"none"});
    }
    else if(msg && msg.clearAllData){
        clearLocalData();
        getCurrentTab(function (tab) {
             chrome.tabs.sendMessage(tab.id, {block: "false"});
        })
    }

    /**
     * IMPORTANT
     * or, the channel will be closed
     */
    return true;
});

function setTimer(time,callback){
    isWaitingTimer = true;
    timer = time;
    var timerInst = setInterval(function(){
        if(timer>0) timer --;
        else{
            clearInterval(timerInst);
            isWaitingTimer = false;
            if(callback!=undefined) callback();
        }
    },1000);
}

function doCheckIfInList(url,sendResponse) {
    purifyBlackAndWhite();
    var purified = purifyUrl(url);
    var cutted = cutOffHeadAndTail(url);
    var isBad = checkBlock(purified,cutted);
    var str;
    if(isBad==0) str = "white";
    // else if(isBad==1) str = "hard";
    else if(isBad==2) str = "soft";
    else str = "none";
    sendResponse({block:str});
    console.log("is bad? " + str);
}

/**
 * main thread of checking if tab is block
 * @param tab
 */
function  dealWithUrlMain(tab,callback) {
    // check if has new setting?
    checkIfReload(function(needReload){
        if(needReload){
            loadFile(dealingUrl,tab,callback);
        }
        else{
            dealingUrl(tab,callback);
        }
    });
}

/**
 *  Fire on tab switch
 *
 */
chrome.tabs.onActivated.addListener(function (tabId, windowId) {
    getCurrentTab(function(tab){
        dealWithUrlMain(tab);
    });
});

function doTimeRecord(tab,tabUrl){

    var url;
    if(tab=="tabUrl"){
        url = tabUrl;
    }
    else if(tab){
        url = tab.url;
    }
    else{
        url = "null";
    }

    // do time record
    if(currentPage!="" && currentPageLoadTime!=0){
        var pur = purifyUrl(currentPage);
        // find which domain this page belongs to and store value
        var current = getCurrentTime();
        var diff = current-currentPageLoadTime;

        // prevent from idiot change day and make his/her extension explode
        if(diff>0) searchDomain(pur, currentPage ,diff);

        saveFileFully(function(){
            console.log("temporary save " + url + " with time : " + diff + "ms");
        });

        // load page for next record
        currentPageLoadTime = current;
        currentPage = url;
    }
    else{
        // load page for next record
        currentPageLoadTime = getCurrentTime();
        currentPage = url;
    }
}

/**
 * Fire on page load
 */
var currentPage="";
var currentPageLoadTime=0;
chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
    if (changeInfo.status == 'complete') {
        // check block
        dealWithUrlMain(tab,function(){
            console.log("on update");
            doTimeRecord(tab);
        });
    }
});

/**
 * return current time in long expression
 * @returns {number}
 */
function getCurrentTime() {
    var date = new Date();
    return date.getTime();
}

/**
 * fire on browser close
 */
chrome.windows.onRemoved.addListener(function(){
    console.log("on remove");
    //saveCurrentTime(getCurrentTime());
    getCurrentTab(function (tab) {
        // no value cuz no need
        doTimeRecord();
    })
});

function searchDomain(purified, rawUrl,  timeDiff) {
    var i;
    var hit = false;

    do{
        // search white first
        for(i=0;i<purifiedWhite.length;i++){
            if(isInList(purified,purifiedWhite[i])==true){
                var url = cutOffHeadAndTail(rawUrl);
                var temp;
                while( (temp = clearLast(url))!=""){
                    url = temp;
                }
                if(!whiteTimeRecordNew[url]) whiteTimeRecordNew[url] = 0;
                whiteTimeRecordNew[url] += timeDiff;
                hit = true;
            }
        }
        for(i=0;i<purifiedSoftLock.length;i++){
            if(isInList(purified,purifiedSoftLock[i])==true){
                var url = cutOffHeadAndTail(rawUrl);
                var temp;
                while( (temp = clearLast(url))!=""){
                    url = temp;
                }
                if(!softTimeRecordNew[url]) softTimeRecordNew[url] = 0;
                softTimeRecordNew[url] += timeDiff;
                hit = true;
            }
        }
    }while( (purified = clearLast(purified))!="" );

    // although this url is not recorded, still counted in total use time
    if(!hit){
        if(!totalTimeRecordNew) totalTimeRecordNew = 0;
        totalTimeRecordNew += timeDiff;
    }

}

function clearLocalData() {
    timer=0;
    clearInterval(timerInst);
    isWaitingTimer = false;
    isAppClosed = false;

    mainMessage="You shall not pass!";

    currentTab = undefined;
    isCheckingReload = false;

    singleSoftLock = [];
    singleWhite = [];

    softLockList = [];
    whiteList = [];

    softTimeRecord = {};
    whiteTimeRecord = {};
    totalTimeRecordNew=0;
    totalTimeRecord=0;

    softTimeRecordNew = {};
    whiteTimeRecordNew = {};

    todayWhiteTimeRecord = {};
    todaySoftTimeRecord = {};
    todayWhiteTotalTimeRecord=0;
    todaySoftTotalTimeRecord=0;
    todayTotalTimeRecord=0;

    purifiedSoftLock=[];
    purifiedWhite=[];

    currentPageLoadTime = getCurrentTime();
}