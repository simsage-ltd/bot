
class Bot {

    constructor(settings, update_ui) {
        this.ws_base = settings.ws_base;
        this.update_ui = update_ui;
        this.settings = settings;
	    this.is_connected = false;    // connected to endpoint?
	    this.message_list = [];  // conversation list
	    this.stompClient = null;

	    // could the bot answer the question
        this.hasResult = true;
        this.hasError = false;
    }

    // connect to the system
    ws_connect() {
        var self = this;
        if (!this.is_connected && this.ws_base) {
            // this is the socket end-point
            var socket = new SockJS(this.ws_base);
            this.stompClient = Stomp.over(socket);
            this.stompClient.connect({},
                function (frame) {
                    self.stompClient.subscribe('/chat/' + self.getClientId(), function (answer) {
                        console.log('receiving');
                        self.receiveData(JSON.parse(answer.body));
                    });
                    self.setConnected(true);
                },
                (err) => {
                    console.error(err);
                    this.setConnected(false);
                });
        }
    }

    setConnected(is_connected) {
        this.is_connected = is_connected;
        this.hasResult = true;
        this.hasError = false;

        if (!is_connected) {
            if (this.stompClient !== null) {
                this.stompClient.disconnect();
                this.stompClient = null;
            }
            console.log("ws-disconnected");
            setTimeout(this.ws_connect.bind(this), 5000); // try and re-connect as a one-off in 5 seconds
        } else {
            console.log("ws-connected");
        }
        this.refresh();
    }

    sendMessage(endPoint, data) {
        if (this.is_connected) {
            this.hasError = false;
            this.stompClient.send(endPoint, {}, JSON.stringify(data));
        }
    }

    refresh() {
        if (this.update_ui) {
            this.update_ui(this);
        }
    }


    showError(title, errStr) {
        this.hasResult = false;
        this.hasError = true;
        alert(errStr);
        this.refresh();
    }

    // create a random guid
    guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    // get or create a session based client id for SimSage usage
    getClientId() {
        var clientId = localStorage.getItem("bot_client_id");
        if (!clientId || clientId.length === 0) {
            clientId = this.guid();
            localStorage.setItem("bot_client_id", clientId);
        }
        return clientId;
    }

    static linksToHtml(urlList) {
        let linkStr = "";
        if (urlList) {
            for (const url of urlList) {
                linkStr += "<div class='link'><a href='" + url + "' target='_blank'>" + url + "</a></div>";
            }
        }
        if (linkStr.length > 0) {
            linkStr = "<br/><div class='link-box'>" + linkStr + "</div>";
        }
        return linkStr;
    }

    static userMessageWrapper(text, urlList) {
        return  "<div class=\"chatbox_body_message chatbox_body_message-right\">\n" +
                "<img src=\"images/human.svg\" alt=\"you\">\n" +
                "<div class='chatbox_body_inside'>" + text + Bot.linksToHtml(urlList) + "</div>" +
                "</div>\n"
    }

    static simSageMessageWrapper(text, urlList) {
        return  "<div class=\"chatbox_body_message chatbox_body_message-left\">\n" +
                "<img src=\"images/tinman.svg\" alt=\"SimSage\">\n" +
                "<div class='chatbox_body_inside'>" + text + Bot.linksToHtml(urlList) + "</div>" +
                "</div>\n"
    }

    static systemBusyMessage() {
        return  "<div class=\"busy-image-container\"><img class=\"busy-image\" src=\"images/dots.gif\" alt=\"Please wait\"></div>\n";
    }

    static convertToCSV(objArray) {
        var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        var str = '';
        for (var i = 0; i < array.length; i++) {
            var line = '';
            for (const index in array[i]) {
                if (line !=='') line += ',';
                let text = array[i][index];
                if (text && text.indexOf && text.indexOf(",") >= 0) {
                    text = '"' + text + '"';
                }
                line += text;
            }
            str += line + '\r\n';
        }
        return str;
    }

    downloadConversation(event) {
        event.stopPropagation();
        // perpare the data
        const data = [];
        this.message_list.map((item) => {
            data.push([item.text, item.origin, item.time]);
        });
        const csv = Bot.convertToCSV(data);
        window.open("data:text/csv;charset=utf-8," + escape(csv));
    }

    messageListToHtml() {
        var result = "";
        let lastMessageUser = false;
        this.message_list.map((item) => {
            if (item.text && item.origin === "simsage") {
                result += Bot.simSageMessageWrapper(item.text, item.urlList);
                lastMessageUser = false;
            } else if (item.text) {
                result += Bot.userMessageWrapper(item.text, item.urlList);
                lastMessageUser = true;
            }
        });
        if (lastMessageUser && !this.hasError) {
            result += Bot.systemBusyMessage();
            console.log("has busy message");
        }
        return result;
    }

    receiveData(data, origin) {
        if (data) {
            this.hasResult = true;
            if (data.error && data.error.length > 0) {
                this.showError("error", data.error);

            } else {
                if (data.text && data.text.length > 0) {
                    this.message_list.push({"text": data.text, "origin": "simsage",
                        "urlList": data.urlList, "imageList": data.imageList, "time": new Date()});
                    this.hasResult = data.hasResult;
                    this.hasError = false;
                    this.refresh();
                }
            }
        }
    }

    reply_with_text(text) {
        if (this.is_connected && text.length > 0) {
            this.stompClient.send("/ws/ops/query", {},
                JSON.stringify({
                    'securityId': settings.sid,
                    'organisationId': settings.organisationId,
                    'kbId': settings.kbId,
                    'customerId': this.getClientId(),
                    'query': text,
                    numResults: 1,
                    scoreThreshold: 0.9
                }));
            this.hasResult = false;
            this.hasError = false;
            this.message_list.push({"text": text, "origin": "user", "time": new Date()});
            this.refresh();
        }
    }


}

