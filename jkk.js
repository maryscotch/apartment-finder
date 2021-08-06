const puppeteer = require("puppeteer");
const line = require("@line/bot-sdk");
const fs = require("fs");

const config = {
    channelAccessToken: "",
    channelSecret: ""
};

const lineClient = new line.Client(config);

function hashApartment(apartment) {
    return `${apartment.title}${apartment.ku}${apartment.size}${apartment.serviceFee}${apartment.type}`;
}

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"]
    }); // default is true
    const page = await browser.newPage();
    await page.goto("https://www.to-kousya.or.jp/chintai/index.html", {
        waitUntil: "domcontentloaded"
    });

    const realPagePromise = new Promise((resolve, reject) => {
        browser.on("targetcreated", target => {
            const newPage = target.page().then(newPage => {
                const pageURL = newPage.url();

                if (
                    pageURL ===
                    "https://jhomes.to-kousya.or.jp/search/jkknet/service/akiyaJyoukenStartInit"
                ) {
                    resolve(newPage);
                }
            });
        });
    });

    page.click(
        "a[href='https://jhomes.to-kousya.or.jp/search/jkknet/service/akiyaJyoukenStartInit?link_id=01']"
    );

    const realPage = await realPagePromise;

    // wait until checkbox is visible
    await realPage.waitForSelector("input[value='12']", { visible: true });

    // select setagaya-ku
    await realPage.click("input[value='12']");
    await realPage.click("input[value='13']");
    await realPage.click("input[value='10']");

    // click search button 検索を押して
    await realPage.waitForSelector(
        "img[src='/search/jkknet/images/bt_kensaku_out.gif']",
        { visible: true }
    );
    await realPage.click("img[src='/search/jkknet/images/bt_kensaku_out.gif']");

    await realPage.waitForSelector("select[name='akiyaRefRM.showCount']", {
        visible: true
    });
    await realPage.select("select[name='akiyaRefRM.showCount']", "50");

    await new Promise(function(resolve, reject) {
        console.log("waiting 2s...");
        setTimeout(resolve, 2000);
    });

    await realPage.waitForSelector("select[name='akiyaRefRM.showCount']", {
        visible: true
    });

    const apartments = await realPage.evaluate(() => {
        const results = document.querySelectorAll(".cell666666 tr");
        const converted = Array.prototype.slice.call(results);

        return converted
            .map(row => {
                if (row.className.indexOf("ListTX") == -1) {
                    return null;
                }

                const columns = Array.prototype.slice.call(
                    row.querySelectorAll("td")
                );

                const title = columns[1].innerText;
                const ku = columns[2].innerText;
                const size = columns[6].innerText;
                const rent = columns[7].innerText;
                const serviceFee = columns[8].innerText;
                const type = columns[5].innerText;

                console.log(title);

                return {
                    title,
                    size,
                    rent,
                    serviceFee,
                    type,
                    ku
                };
            })
            .filter(el => {
                return el !== null;
            });
    });

    let previousApartments = [];
    try {
        // read last time apartment from disk
        const data = fs.readFileSync("./jkk.json", "utf8");
        previousApartments = JSON.parse(data);
    } catch (error) {
        // if it doesn't exist, just ignore
    }

    // only find new apartments, so if the apartment is inside the previousApartments array, ignore it
    const newApartments = apartments.filter(apartment => {
        for (var i = 0; i < previousApartments.length; i++) {
            const previousApartment = previousApartments[i];

            if (hashApartment(previousApartment) === hashApartment(apartment)) {
                return false;
            }
        }

        return true;
    });

    // save apartment list into jkk.json
    fs.writeFileSync("./jkk.json", JSON.stringify(apartments), "utf8");

    // if no new apartments, just don't do anything and skip
    if (newApartments.length === 0) {
        console.log("No new apartments");
        await browser.close();
        return;
    }

    let text = "Hi! These are new apartments on JKK: :)\n";
    newApartments.forEach(apartment => {
        text =
            text +
            `[${apartment.rent}] ${apartment.type}(${apartment.size}) -- ${apartment.title}\n`;
    });

    text = text + "Is there one you like???";

    await browser.close();

    // send line message
    const message = {
        type: "text",
        text: text
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
})();
