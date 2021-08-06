const fetch = require("node-fetch");
const fs = require("fs");
const line = require("@line/bot-sdk");

const config = {
    channelAccessToken: "",
    channelSecret: ""
};

const lineClient = new line.Client(config);

const url =
    "https://chintai.sumai.ur-net.go.jp/chintai/api/bukken/search/list_bukken/";

// 03品川区、目黒区、大田区、世田谷区
const areaCodes = ["03", "04"];
// 01 = Shibuya

function getDataForAreaCode(areaCode) {
    return new Promise((resolve, reject) => {
        fetch(url, {
            method: "POST",
            headers: {
                "Content-type":
                    "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: `tdfk=13&area=${areaCode}`
        })
            .then(res => res.text())
            .then(text => JSON.parse(text))
            .then(function(data) {
                console.log("Request succeeded with JSON response");
                resolve(data);
            })
            .catch(function(error) {
                console.log("Request failed", error);
                reject(error);
            });
    });
}

const setagayaData = getDataForAreaCode("03");
const shibuyaData = getDataForAreaCode("01");

Promise.all([setagayaData, shibuyaData]).then((values) => {
    const apartmentList = [].concat(values[0], values[1]);

    const availableApartments = [];
    apartmentList.forEach(element => {
        if (element.roomCount === 0) {
            return;
        }
        availableApartments.push(element);
    });

    let previousApartments = [];
    try {
        // read last time apartment from disk
        const data = fs.readFileSync("./ur.json", "utf8");
        previousApartments = JSON.parse(data);
    } catch (error) {
        // if it doesn't exist, just ignore
    }

    // only find new apartments, so if the apartment is inside the previousApartments array, ignore it
    const newApartments = availableApartments.filter(apartment => {
        for (var i = 0; i < previousApartments.length; i++) {
            const previousApartment = previousApartments[i];

            if (previousApartment["id"] === apartment["id"]) {
                return false;
            }
        }

        return true;
    });

    if (newApartments.length === 0) {
        console.log("no new apartments on UR");
        return;
    }

    let apartmentsInfo = "Found these apartments on ur \n";
    newApartments.forEach(element => {
        apartmentsInfo =
            apartmentsInfo +
            `[${element.rent}] ${element.name} (${element.skcs}):\n${element.access}\n\n`;
    });

    // make a bit prettier by replacing <br>
    apartmentsInfo = apartmentsInfo.split("<br>").join("\n");
    console.log(apartmentsInfo)

    // send line message
    const message = {
        type: "text",
        text: apartmentsInfo
    };

    lineClient
        .pushMessage("C5f6cb577e0d6b0ff381992f1c7e2e764", message)
        .then(() => {
            console.log("ok, sent!");
        })
        .catch(err => {
            console.log("error happened");
            console.log(err);
        });

    fs.writeFileSync("./ur.json", JSON.stringify(availableApartments), "utf8");
});
