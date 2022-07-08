// ETL helper code
// Requires 210 GB of datasets to have been downloaded and uncompressed
// Update filenames at bottom of file once datasets downloaded
//   ChessDB: https://www.kaggle.com/milesh1/35-million-chess-games
//   Lichess: https://database.lichess.org/#standard_games, 2021 September
//
// Execute with `npm install`, `node etl.js`. Expected runtime is 50 minutes.
// Output will be in `data.js`.

const readline = require('readline');
const fs = require('fs');
const util = require('util');
const {
    urlToHttpOptions
} = require('url');
const {
    timeStamp
} = require('console');
console.logAll = (val) => {
    console.log(util.inspect(val, false, 100, true));
};

// Given that `filename` is the name of the data file for the pro-game
// data source from Kaggle, read up to `maxQuantity` games, invoking
// `callback` with an object describing the game for each of them,
// and ultimately calling `closeCallback` when the file is read or 
// we have reached the maximum quantity of games.
function forEachProGame(filename, maxQuantity, callback, closeCallback) {
    const lineReader = readline.createInterface({
        input: fs.createReadStream(filename),
        terminal: false
    });

    let count = 0;

    // This runs for each line of the input file, which corresponds
    // to a single game. Basically, "for each game..."
    lineReader.on('line', (line) => {
        line = line.trim()

        // Ignore empty lines and ones that begin with #, which
        // indicates a comment
        if (!(line.length === 0 || line[0] === '#')) {
            // Split line into words
            let lineItems = line.split(/\s/);
            let foundPound = false;
            let moves = [];

            // "###" separates the metadata from the game itself
            // Stop if we encounter it
            for (let i = 0; i < lineItems.length; i++) {
                if (lineItems[i] === "###") {
                    foundPound = true;
                    continue;
                }

                if (foundPound) {
                    moves.push(lineItems[i]);
                }
            }

            // Invoke the callback with the object you can see
            // below - this has all the info our analysis will need
            callback({
                index: parseInt(lineItems[0]),
                date: new Date(
                    lineItems[1].substr(0, 4),
                    lineItems[1].substr(5, 2),
                    lineItems[1].substr(8, 2)
                ),
                result: lineItems[2],
                welo: parseInt(lineItems[3]),
                belo: parseInt(lineItems[4]),
                len: parseInt(lineItems[5]),
                moves: moves,
                origin: "pro"
            });

            // Check that we haven't gotten the max quantity yet
            // If we have, quit. lineReader.close() actually
            // triggers the 'close' event below
            count++;
            if (typeof maxQuantity === "number" && count >= maxQuantity) {
                lineReader.close();
            }
        }
    });

    // This will trigger when either the lineReader is at EOF
    // or if .close() has been called manually
    lineReader.on('close', closeCallback);
}

// Match a single chess move in algebraic notation
const MOVE_PATTERN = /([0-9]+)(\.|\.\.\.)\s+(\S+) \{/g;

// Parse a single line of algebraic chess moves in lichess format
// These lack the "W1." prefix of the pro games from Kaggle,
// but include annoying { metadata } sections that we must skip
function lichessMovesParse(line) {
    let moves = [];

    for (const match of line.matchAll(MOVE_PATTERN)) {
        let moveIdx = parseInt(match[1]);
        let player = (match[2] === '.' ? 'W' : 'B');
        let move = match[3];
        moves.push(`${player}${moveIdx}.${move}`);
    }

    return moves;  // the format of the return matches that of the pro games
}

// Various patterns to match metadata in the lichess dataset
// These are actually on one line each, so they're of the form /^...$/
const DATE_PATTERN = /^\[Date\s+\"([0-9]{4})\.([0-9]{2})\.([0-9]{2})\"\]$/;
const ELO_PATTERN = /^\[(White|Black)Elo\s+\"([0-9]+)\"\]$/;
const RESULT_PATTERN = /^\[Result\s+\"([^"]+)\"\]$/;
const MOVE_1_PATTERN = /^([0-9]+)\.\s+(\S+)/;
const MOVE_2_PATTERN = /^(?:[0-9]+)\.\s+(?:\S+)\s*(?:\{[^}]+\})?\s*([0-9]+)\.{3}\s+(\S+)/;

// Given that `filename` is the name of the data file for the lichess
// data source, read up to `maxQuantity` games, invoking
// `callback` with an object describing the game for each of them,
// and ultimately calling `closeCallback` when the file is read or 
// we have reached the maximum quantity of games.
//
// The format for the callback is identical to that of the pro games.
function forEachLichessGame(filename, maxQuantity, callback, closeCallback) {
    const lineReader = readline.createInterface({
        input: fs.createReadStream(filename),
        terminal: false
    });

    // State for the parser.
    let index = 0;
    let date = null;
    let result = null;
    let welo = NaN;
    let belo = NaN;
    let moves = [];

    // Lines in the lichess dataset do not correspond to a single
    // game each. Instead, the metadata is stored one line per key-value
    // pair, and the entire game is stored as space-separated
    // algebraic notation just below the metadata.
    //
    // Therefore, we take the first line containing algebraic notation
    // to the game corresponding to the metadata that we have built up
    // as we read line by line. At that point, we mash together
    // the metadata we have accumulated with that game, send it to
    // the callback, clear everything, and resume with a blank slate.
    lineReader.on('line', (line) => {
        line = line.trim();

        let match;

        if ((match = DATE_PATTERN.exec(line)) !== null) {
            date = new Date(
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3])
            );
        }

        if ((match = ELO_PATTERN.exec(line)) !== null) {
            if (match[1] === "White") {
                welo = parseInt(match[2]);
            } else {
                belo = parseInt(match[2]);
            }
        }

        if ((match = RESULT_PATTERN.exec(line)) !== null) {
            result = match[1];
        }

        if ((match = MOVE_1_PATTERN.exec(line)) !== null) {
            moves = lichessMovesParse(line);

            // Here, we invoke the callback because we have matched
            // the first move of a chess game.
            // 
            // Afterwards, clear the metadata.
            if (date !== null &&
                result !== null && moves.length >= 2
            ) {
                callback({
                    index,
                    date,
                    result,
                    welo,
                    belo,
                    len: moves.length,
                    moves,
                    origin: "lichess"
                });

                index++;

                if (index >= maxQuantity) {
                    lineReader.close();
                }
            }

            // Clear metadata.
            date = null;
            result = null;
            welo = NaN;
            belo = NaN;
            moves = [];
        }
    });

    lineReader.on('close', closeCallback);
}

// Mappings from algebraic notation to internal names for pieces.
const PIECES = {
    'a': "pawn",  // a through h all represent pawns
    'b': "pawn",  // because pawns do not actually have piece names
    'c': "pawn",  // instead, we just use the column a-h
    'd': "pawn",
    'e': "pawn",
    'f': "pawn",
    'g': "pawn",
    'h': "pawn",
    'N': "knight",
    'R': "rook",
    'O': "castling", // O-O and O-O-O both represent castling
    'B': "bishop",
    'K': "king",
    'Q': "queen"
}


// Represents the number of times a certain event has occurred
// during the nth move of a game.
class Counts {
    constructor(name) {
        this.name = name;
        this.data = [];
    }

    // Register that this event has occured on the nth move.
    // If we would go past the end of the array, append items
    // to the array until we can safely add the value.
    count(n) {
        while (n > this.data.length - 1) {
            this.data.push(0);
        }
        this.data[n]++;
    }

    // Get the count for the nth move.
    // If we ask for a move that has never occurred, return 0.
    get(n) {
        if (n <= 0 || n >= this.data.length) {
            return 0;
        }

        return this.data[n];
    }

    // Return the highest index of any count we have stored.
    lastNonzeroIndex() {
        return this.data.length - 1;
    }

    // Return the data we will put into our JSON output.
    asPlainObject() {
        return {
            name: this.name,
            data: this.data
        };
    }
}

const ELO_SUFFIXES = ["", "_low", "_mid", "_hi"];

class DataAggregator {
    // Creates all of the Counts objects mapping to each category
    // of time-series data.
    // This includes:
    //    ["total", "king", "queen", ...] + any elo suffix
    //    "pos_a1", ..., "pos_h8"
    //    "pos_castle"
    constructor() {
        this.counts = new Map();
        this.totalGamesCounted = 0;

        ELO_SUFFIXES.forEach((suffix) => {
            this.addCounts("total" + suffix);

            for (let k in PIECES) {
                let v = PIECES[k];
                if (!(this.counts.has(v + suffix))) {
                    this.addCounts(v + suffix);
                }
            }

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    this.addCounts("pos_" + this.getRowColName(r, c) + suffix);
                }
            }
            this.addCounts("pos_castle" + suffix);
        });

    }

    // Returns the algebraic string representing a row-col pair
    // getRowColName(0, 0) -> "a1"
    getRowColName(r, c) {
        // 97 is 'a', so 97 + r indexes into 'abcdefg...'
        return String.fromCharCode(97 + r) + (c + 1);
    }

    // Extract the algebraic row-col pair from a full algebraic move.
    // Given a move like "B3.nf6", return "f6", the destination
    // of the move. If there is no clear destination (i.e. "O-O"),
    // return null.
    getMoveRC(move) {
        let last = move.length - 1;

        // while `last` is one of "+#?!", move `last` one to the left  
        while (last > 0 && "+#?!".indexOf(move[last]) !== -1) {
            last--; // move left to skip annotations
        }

        if (last >= 3 && move[last - 1] === '=') {
            last -= 2; // for "W44.a8=Q" promotions
        }

        if (last - 1 < 0) {
            return null;
        }

        let rowcol = move.substr(last - 1, 2);

        if (
            rowcol[0] >= 'a' && rowcol[0] <= 'h' &&
            rowcol[1] >= '1' && rowcol[1] <= '8'
        ) {
            return rowcol;
        } else {
            return null;
        }
    }

    // Append a blank, zeroed out Counts object to our dataset.
    addCounts(name) {
        this.counts.set(name, new Counts(name));
    }

    // Read up to `quantity` items from `filename` in the Kaggle pro
    // game format, then output.
    processProData(filename, quantity, completeCallback) {
        forEachProGame(
            filename,
            quantity,
            (obj) => this.processGame(obj),
            () => completeCallback()
        );
    }

    // Read up to `quantity` items from `filename` in the lichess
    // game format, then output.
    processLichessData(filename, quantity, completeCallback) {
        forEachLichessGame(
            filename,
            quantity,
            (obj) => this.processGame(obj),
            () => completeCallback()
        );
    }

    // Determine the elo suffix for a game.
    eloSuffix(elo) {
        if (elo < 1225) return "_low"; // bottom 20%
        if (elo < 1875) return "_mid"; // middle 60%
        return "_hi"; // top 20% of players
    }

    // This is the callback that processes streamed data from
    // the file readers/parsers above.
    //
    // `game` is a JS object containing metadata and an
    // array of moves in "W1.__" algebraic notation.
    processGame(game) {
        
        // For each move...
        for (let i = 0; i < game.moves.length; i++) {
            this.counts.get("total").count(i);

            // The ELO is determined by the white player, 
            // or by the black player if the white player is unranked.
            const elo =
                game.moves[i][0] === 'W' ? game.welo :
                game.moves[i][0] === 'B' ? game.belo : NaN;
            const eloSuffix = this.eloSuffix(elo);

            // Extract the RC notation.
            let where = this.getMoveRC(game.moves[i]);
            if (where === null) {
                where = "castle";
            }

            // If we know the ELO, track counts in ELO-filtered lists.
            if (!Number.isNaN(elo)) {
                this.counts.get("total" + eloSuffix).count(i);
                this.counts.get("pos_" + where).count(i);
                this.counts.get("pos_" + where + eloSuffix).count(i);
            }

            // Extract which piece moved.
            let dotLocation = game.moves[i].indexOf('.');
            if (dotLocation !== -1) {
                let piece = game.moves[i][dotLocation + 1];
                if (piece in PIECES) {
                    const prefix = PIECES[piece];

                    // Now we know which piece moved, so increment its counts.
                    this.counts.get(prefix).count(i);
                    if (!Number.isNaN(elo)) {
                        this.counts.get(prefix + eloSuffix).count(i);
                    }
                }
            }
        }

        // Output a progress message every 100k games.
        this.totalGamesCounted++;
        if (this.totalGamesCounted % 100000 === 0) {
            console.log(`Games: ${this.totalGamesCounted}`);
        }
    }

    // Get the entire dataset in a format we can output.
    getJson() {
        return JSON.stringify({
            eventsByMove: Array.from(this.counts.values())
                .map(x => x.asPlainObject())
        });
    }


}

// Dataset filenames.
const DATA_FILE = 'data/all_with_filtered_anotations_since1998.txt';
const LICHESS_FILE = 'E:\\gambit\\lichess_db_standard_rated_2021-09.pgn';

//forEachLichessGame(LICHESS_FILE, 100000, (game) => {}, () => console.log("done"));



// There are approximately 70 million games, so if QUANTITY
// is above that, we process everything.
const QUANTITY = 100_000_000;

// This is effectively the main function.
const agg = new DataAggregator();

// This chain of callbacks processes the pro data, then the lichess
// data, then outputs it all.
agg.processProData(
    DATA_FILE,
    QUANTITY,
    () => {
        agg.processLichessData(
            LICHESS_FILE,
            QUANTITY,
            () => {
                fs.writeFileSync("data.js", "const DATA = " + agg.getJson() + ";", "utf-8");
            }
        )
    }
)