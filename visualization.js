// Represents the number of times a certain event has occurred
// during the nth move of a game.
class Counts {
    constructor(name, data) {
        this.name = name;
        this.data = data.slice(); // make shallow copy
    }

    // Adds `times` to the `n`th position of data, expanding
    // `data` if necessary to make room.
    count(n, times) {
        while (n > this.data.length - 1) {
            this.data.push(0);
        }
        this.data[n] += times;
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

    // Return the data as an array of objects for the domain [low, high)
    getDomain(low, high) {
        return range(low, high).map(x => ({
            x: x,
            y: this.get(x)
        }));
    }

    // aggregate data by a particular `aggregation`
    // used for filtering by players. 
    aggregateBy(aggregation) {
        // adding white and black moves of a round together for aggregated
        if (aggregation === "aggregated") {
            let newData = [];
            for (let i = 0; i < this.data.length - 1; i += 2) {
                newData.push(this.data[i] + this.data[i + 1]);
            }
            this.data = newData;
        } else if (aggregation === "white") { // white moves are even-numbered
            this.data = this.data.filter((v, i) => i % 2 === 0);
        } else if (aggregation === "black") { // black moves are odd-numbered
            this.data = this.data.filter((v, i) => i % 2 === 1);
        }
    }
}


// returns a Counts object containing the key as name and found data as data if 
// the key is found, otherwise throw error. 
function findData(key, aggregation) {
    for (let d of DATA.eventsByMove) {
        if (d.name === key) {
            let data = new Counts(d.name, d.data);
            data.aggregateBy(aggregation);
            return data;
        }
    }
    throw new Error(`Key ${key} not found!`);
}

// generalized sum by name `name` and lambda function `predicate`, which
// returns true if the key matches a regex defined in the lambda. 
// result is aggregated by `aggregation` before returning. 
function sumGeneral(name, predicate, aggregation) {
    let result = new Counts(name, []);

    for (let datum of DATA.eventsByMove) {
        let key = datum.name;
        let data = datum.data;

        if (predicate(key)) {
            data.forEach((n, idx) => {
                result.count(idx, n);
            });
        }
    }

    result.aggregateBy(aggregation);
    return result;
}

// returns the sum of counts of row `row` with ELO `suffix` and filter by player
// `aggregation`. 
function sumRow(row, suffix, aggregation) {
    return sumGeneral(`row_${row}`, (key) => {
        let match = new RegExp(`^pos_[a-h]([1-8])${suffix}$`).exec(key);
        return match !== null && match[1] === row;
    }, aggregation);
}

// returns the sum of counts of column `col` with ELO `suffix` and filter by player
// `aggregation`.
function sumCol(col, suffix, aggregation) {
    return sumGeneral(`col_${col}`, (key) => {
        let match = new RegExp(`^pos_([a-h])[1-8]${suffix}$`).exec(key);
        return match !== null && match[1] === col;
    }, aggregation);
}

// returns every integer from lo to hi, not inclusive of hi
function range(lo, hi) {
    let result = [];
    for (let i = lo; i < hi; i++) {
        result.push(i);
    }
    return result;
}

// i = 0 returns "a1"; i = 1 returns "a2". This continues up to 
// i = 63 returning "h8".
function rowColString(i) {
    return String.fromCharCode(97 + Math.floor(i / 8), 49 + (i % 8));
}

// uses `findData()` to reshape the data into an object and returns it
function processDataSources(suffix, aggregation) {
    return {
        pieceType: [{
            name: "King",
            data: findData("king" + suffix, aggregation)
        },
        {
            name: "Pawn",
            data: findData("pawn" + suffix, aggregation)
        },
        {
            name: "Rook",
            data: findData("rook" + suffix, aggregation)
        },
        {
            name: "Castling",
            data: findData("castling" + suffix, aggregation)
        },
        {
            name: "Queen",
            data: findData("queen" + suffix, aggregation)
        },
        {
            name: "Bishop",
            data: findData("bishop" + suffix, aggregation)
        },
        {
            name: "Knight",
            data: findData("knight" + suffix, aggregation)
        }
        ],
        rows: "12345678".split("").map(r => ({
            name: r,
            data: sumRow(r, suffix, aggregation)
        })),
        columns: "abcdefgh".split("").map(c => ({
            name: c,
            data: sumCol(c, suffix, aggregation)
        })),
        destination: range(0, 64).map(i => ({
            name: rowColString(i),
            data: findData(`pos_${rowColString(i)}${suffix}`, aggregation)
        }))
    };
}


class App {
    constructor() {

        // UI state
        this.graphType = "normalizedStacked";
        this.dataSource = "pieceType";
        this.eloSuffix = "";
        this.keyFilter = new Set(); // TODO: init to nonempty
        this.aggregation = "separate";
        this.startTime = 0;
        this.endTime = 200;
        this.currentTime = 10;

        this.data = processDataSources(this.eloSuffix, this.aggregation);

        // initialization
        this.registerEvents();
        this.updateCheckboxes();
        this.redrawTimeSeries();
        this.redrawHeatmap();
        this.displayDescription(this.dataSource, d3.select("div#step1description"))
        this.displayDescription(this.graphType, d3.select("div#step2description"))
    }

    // registers DOM events and calls the events' respective update functions
    registerEvents() {
        d3.select("#graph-type").on("input", (e) => {
            this.changeGraphType(e.target.value);
        });
        d3.select("#data-source").on("input", (e) => {
            this.changeDataSource(e.target.value);
        });
        d3.select(".elos").on("change", (e) => {
            this.changeElos(e.target.value);
        });
        d3.select(".filters").on("input", (e) => {
            this.changeKeyFilter(e.target.name, e.target.checked);
        });
        d3.select(".colors").on("change", (e) => {
            this.changeColors(e.target.value);
        });
    }

    // called when filters (checkboxes) are changed
    changeKeyFilter(keyName, checked) {
        if (checked) {
            this.keyFilter.add(keyName);
        } else {
            this.keyFilter.delete(keyName);
        }
        let checkboxes = d3.select("#filters").selectAll("input");
        let self = this;
        if (this.keyFilter.size === 10) {
            checkboxes.filter(function () {
                return !self.keyFilter.has(d3.select(this).attr("name"))
            }).attr("disabled", "true")
        }
        else {
            checkboxes.attr("disabled", null)
        }
        this.redrawTimeSeries(); // redraws left graph
    }

    // called when graph type is changed
    changeGraphType(newValue) {
        this.graphType = newValue;
        this.redrawTimeSeries(); // redraws left graph
        this.displayDescription(this.graphType, d3.select("div#step2description")) //redraws description
    }

    // called when data source dropdown list option is changed
    changeDataSource(newValue) {
        this.dataSource = newValue;
        this.updateCheckboxes(); // update filters checkboxes to match
        this.redrawTimeSeries(); // redraws left graph
        this.displayDescription(this.dataSource, d3.select("div#step1description")) //redraws description
    }

    // this is called when the ELOs radio buttons options are changed
    changeElos(newValue) {
        this.eloSuffix = newValue;
        this.data = processDataSources(this.eloSuffix, this.aggregation);
        this.redrawTimeSeries(); // redraws left graph
        this.redrawHeatmap();    // redraws heatmap on the right
    }

    // this is called when filter by player radio buttons options are changed
    changeColors(newValue) {
        this.aggregation = newValue;
        this.endTime = (this.aggregation === "separate" ? 200 : 100);
        this.data = processDataSources(this.eloSuffix, this.aggregation);
        this.redrawTimeSeries(); // redraws left graph
        this.redrawHeatmap();    // redraws heatmap on the right
    }

    // Selects description to display for data options
    displayDescription(value, d3Selection) {
        d3Selection.selectAll("p")
            .join("p")
            .style("display", d => "none");
        d3.select("p#" + value + "Des").style("display", "block")
    }

    // redraws left graph based on graph type
    redrawTimeSeries() {
        if (this.graphType === "normalizedStacked") {
            this.drawStacked(true);
            this.redrawSummary(true);
        } else if (this.graphType === "stacked") {
            this.drawStacked(false);
            this.redrawSummary(false);
        } else if (this.graphType === "line") {
            this.drawLine();
            this.redrawSummary(false, true);
        } else {
            throw new Error(`Invalid graphType "${this.graphType}"!`);
        }
    }

    //redraws the summary under the time series
    redrawSummary(isNormalized, isLine) {
        const data = this.extractTimeSeriesData();
        let summaryElement = d3.select("div.horiz.summary");
        summaryElement.html("");
        summaryElement.append("h4").text("Move " + this.currentTime + " Summary and Legend");
        // if (isNormalized && data.length !== 0) summaryElement.append("text").text(" | Normalized")
        data.forEach(d => {
            let dstring = isNormalized ? ((d.values[this.currentTime].y - d.values[this.currentTime].y0) * 100).toFixed(1) + "%" :
                isLine ? d.values[this.currentTime].y :
                    Math.round(d.values[this.currentTime].y - d.values[this.currentTime].y0);
            summaryElement.append("br")
            summaryElement.append("text").text(d.name + ": " + dstring).style('color', d3.select("#g" + d.name)._groups[0][0].getAttribute('stroke'));
            // summaryElement.append("text").text('&#9632;')
        })
        // // Create Legend:
        // const keys=d3.select('#points').selectChildren("g")._groups[0];
        // keys.forEach(k=>{
        //     const id = k.id;
        //     if (k.id==''){
        //         return;
        //     }
        //     else{
        //         const name = k.id;
        //         const color = k.getAttribute('stroke');

        //     }
        // });
    }

    redrawHeatmap() {
        let {
            svg,
            width,
            height,
            margin,
            chartWidth,
            chartHeight,
            annotations,
            chartArea
        } = this.makeGraph("svg#heatmap-graph", 30, 10, 40, 40, 'Column', 'Row');
        d3.select("#HeatTitle").text("Frequency of Destinations at Move " + this.currentTime)

        const data = this.extractHeatmapData();
        let maxCount = Math.max(...data.map(d => d.value));

        // Labels of row and columns -> unique identifier of the column called 'group' and 'variable'
        const cols = Array.from(new Set(data.map(d => d.x)));
        const rows = Array.from(new Set(data.map(d => d.y)));

        // Build X scales and axis:
        const xScale = d3.scaleBand()
            .domain(cols)
            .range([0, chartWidth - 50])
            .padding(0.05);
        chartArea.append("g")
            .style("font-size", 15)
            .attr("transform", `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale).tickSize(0))
            .select(".domain").remove();

        // Build Y scales and axis:
        const yScale = d3.scaleBand()
            .range([chartHeight, 0])
            .domain(rows)
            .padding(0.05);
        chartArea.append("g")
            .style("font-size", 15)
            .call(d3.axisLeft(yScale).tickSize(0))
            .select(".domain").remove();

        // Build color scale
        maxCount = maxCount === 0 ? maxCount + 1 : maxCount;
        const colorScale = maxCount !== 0 ?
            d3.scaleSequential()
                .interpolator(d3.interpolateInferno)
                .domain([0, maxCount])
            : function (x) { return "black" };


        // add the squares
        chartArea.selectAll()
            .data(data, function (d) {
                return d.x + ':' + d.y;
            })
            .join("rect")
            .attr("x", function (d) {
                return xScale(d.x)
            })
            .attr("y", function (d) {
                return yScale(d.y)
            })
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("width", xScale.bandwidth())
            .attr("height", yScale.bandwidth())
            .style("fill", function (d) {
                return colorScale(d.value)
            })
            .style("stroke-width", 4)
            .style("stroke", "none")
            .style("opacity", 0.8);

        //build gradient for legend
        let gradient = chartArea.append("defs").append("linearGradient")
            .attr("id", "gradient")
            .attr("y1", "100%")
            .attr("y2", "0%")
            .attr("x1", "100%")

        gradient.append('stop')
            .attr("offset", "0%")
            .attr("stop-color", colorScale(0));

        gradient.append('stop')
            .attr("offset", "25%")
            .attr("stop-color", colorScale(maxCount / 4));

        gradient.append('stop')
            .attr("offset", "50%")
            .attr("stop-color", colorScale(maxCount / 2));

        gradient.append('stop')
            .attr("offset", "75%")
            .attr("stop-color", colorScale(maxCount * 3 / 4));

        gradient.append('stop')
            .attr("offset", "100%")
            .attr("stop-color", colorScale(maxCount))

        //build the legend
        chartArea.append("rect")
            .attr("x", chartWidth - 24)
            .attr("y", 0)
            .attr("width", "20")
            .attr("height", chartHeight)
            .attr("fill", "url('#gradient')")

        //add labels
        annotations.append("text")
            .attr("x", chartWidth + 10)
            .attr("y", chartHeight + 50)
            .text("Low")
            .style("fill", "white")

        annotations.append("text")
            .attr("x", chartWidth + 8)
            .attr("y", "20")
            .text("High")
            .style("fill", "white")


    }

    // change `this.data` into a shape that can be used in `drawLine()`
    // this leaves us data in the form 
    // [ { x: "a", y: "1", value:"129" }, ... ]
    extractHeatmapData() {
        let result = [];

        for (let d of this.data["destination"]) {
            let x = d.name[0];
            let y = d.name[1];
            let value = d.data.get(this.currentTime);
            result.push({
                x,
                y,
                value
            });
        }

        return result;
    }

    // setup process for a d3 graph but it's now a method (epic)
    makeGraph(svgSelector, topMargin, rightMargin, bottomMargin, leftMargin, xaxis, yaxis) {
        const svg = d3.select(svgSelector); // select svg element
        svg.html("");                       // resets svg
        const width = svg.attr("width");    // getting attributes
        const height = svg.attr("height");
        const margin = {
            top: topMargin,
            right: rightMargin,
            bottom: bottomMargin,
            left: leftMargin
        };

        // appending svg groups for use with axes and plotting
        let graph = svg.append('g').attr('id', 'graph');
        let annotations = graph.append("g").attr("id", "annotations");
        let chartArea = graph.append("g").attr("id", "points")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        let y_leftshift = 50;
        let x_bottomshift = 30;
        let y_margin = 0
        if (svgSelector === "svg#time-series-graph") {
            y_leftshift = 30;
            x_bottomshift = 40;
            y_margin = 5;
        }

        const ypos = height - chartHeight / 2 - topMargin;
        // y axis label
        graph.append("text")
            .attr("class", "y label")
            .attr("id", d => {
                if (svgSelector === "svg#time-series-graph") {
                    return "ChartyLabel"
                } else {
                    return "HeatyLabel"
                }
            })
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("y", ypos - y_margin)
            .attr("x", y_leftshift)
            .attr("dy", ".75em")
            .attr("transform", "rotate(270 5 " + ypos + ")")
            .text(yaxis);

        const xpos = chartWidth / 2 + leftMargin;
        // x axis label
        graph.append("text")
            .attr("class", "x label")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("x", xpos)
            // .attr("dy", ".75em")
            .attr("y", (chartHeight + topMargin + x_bottomshift))
            .text(xaxis);

        graph.append("text")
            .attr("class", "chartTitle")
            .attr("id", d => {
                if (svgSelector === "svg#time-series-graph") {
                    return "ChartTitle"
                } else {
                    return "HeatTitle"
                }
            })
            .attr("text-anchor", "middle")
            .attr("dominant-baselign", "center")
            .attr("transform", `translate(${margin.left + chartWidth / 2},${margin.top - 15})`)
            .text("temp")

        // return all of the above in an object
        return {
            svg,
            width,
            height,
            margin,
            chartWidth,
            chartHeight,
            annotations,
            chartArea
        };

    }



    // filters this.data with current data source and current checkboxes (keyFilter)
    // This leaves us with data in the form
    // data = [
    //     { name: "key", values: [{ x: 1, y: 2 }, ...]},
    //     ...
    // ]
    extractTimeSeriesData() {
        let data = this.data[this.dataSource]
            .filter((x) => this.keyFilter.has(x.name))
            .map(d => ({
                name: d.name,
                values: d.data.getDomain(
                    this.startTime, this.endTime
                )
            }));
        if (data.length === 0) {
            return data;
        }

        if (this.graphType === "stacked" || this.graphType === "normalizedStacked") {
            for (let i = 0; i < data[0].values.length; i++) {
                let y0 = 0;
                for (let k = 0; k < data.length; k++) {
                    let previousY0 = y0;
                    data[k].values[i].y0 = y0;
                    y0 += data[k].values[i].y;
                    data[k].values[i].y += previousY0;
                }
                if (y0 !== 0 && this.graphType === "normalizedStacked") {
                    for (let k = 0; k < data.length; k++) {
                        data[k].values[i].y0 /= y0;
                        data[k].values[i].y /= y0;
                    }
                }
            }
        }

        return data;
    }


    //Converts the type string into text that can be used for display in titles 
    //and labels
    convertTypetoText(type) {
        switch (type) {
            case "pieceType":
                return "Piece Types Moved";
            case "rows":
                return "Piece Placement on Rows";
            case "columns":
                return "Piece Placement on Columns";
            case "destination":
                return "Piece Placement on Destinations";
        }
    }

    //Draws the stacked version of the data graph
    //param isNormalized: scales all values into a 0-1 scale for the graph
    drawStacked(isNormalized) {
        let {
            svg,
            width,
            height,
            margin,
            chartWidth,
            chartHeight,
            annotations,
            chartArea
        } = this.makeGraph("svg#time-series-graph", 30, 10, 50, 70, 'Move', 'temp');

        d3.select("#ChartyLabel").text(d => {
            if (isNormalized) {
                return "Relative Frequency of " + this.convertTypetoText(this.dataSource)
            } else {
                return "Frequency of " + this.convertTypetoText(this.dataSource)
            }
        });

        d3.select("#ChartTitle").text(d => {
            if (isNormalized) {
                return "Relative Frequency of " + this.convertTypetoText(this.dataSource) + " at each Turn"
            } else {
                return "Frequency of " + this.convertTypetoText(this.dataSource) + " at each Turn"
            }
        })



        const data = this.extractTimeSeriesData();

        let xMin = this.startTime;
        let xMax = this.endTime;
        let yMin = 0;
        let yMax = Math.max( // max of ys of everything selected in keyFilter
            ...data.map(d => Math.max(...d.values.map(v => v.y)))


        );

        // setting up scales
        let xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, chartWidth]);
        let yScale = d3.scaleLinear().domain([yMin, yMax]).range([chartHeight, 0]);
        let filterScale = d3.scaleOrdinal(d3.schemeCategory10);
        //setting up min/max of slider:
        let heatmapslider = d3.selectAll('#time');
        heatmapslider.attr('max', xMax).attr('min', 0)
            .attr('value', this.currentTime);

        // setting up axes and grid lines
        // Y axis
        let leftAxis = d3.axisLeft(yScale)
            .tickFormat(d3.format(".6"));

        let leftGridlines = d3.axisLeft(yScale)
            .tickSize(-chartWidth - 10)
            .tickFormat("");

        annotations.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(" + (margin.left - 10) + "," + margin.top + ")")
            .call(leftAxis);
        annotations.append("g")
            .attr("class", "y gridlines")
            .attr("transform", "translate(" + (margin.left - 10) + "," + margin.top + ")")
            .call(leftGridlines);

        // X axis
        let bottomAxis = d3.axisBottom(xScale)
            .tickFormat(d3.format(".3"));

        let bottomGridlines = d3.axisBottom(xScale)
            .tickSize(-chartHeight - 10)
            .tickFormat("");

        annotations.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(" + margin.left + "," + (chartHeight + margin.top + 10) + ")")
            .call(bottomAxis);
        annotations.append("g")
            .attr("class", "x gridlines")
            .attr("transform", "translate(" + margin.left + "," + (chartHeight + margin.top + 10) + ")")
            .call(bottomGridlines);


        // area generator used for later
        var areaGenerator = d3.area()
            .x(d => xScale(d.x))
            .y0(d => yScale(d.y0))
            .y1(d => yScale(d.y));

        let graph = chartArea.selectAll('g.line')
            .data(data)
            .join('g')
            .attr('id', d => "g" + d.name)
            .attr("stroke", d => filterScale(d.name))
            .attr("fill", d => filterScale(d.name));



        // svg line element (solid black) that indicates which move the text box
        // in the line graph is detailing    
        let hoverLine = chartArea.append("line")
            .attr("visibility", "hidden");

        // dotted line svg element that indicates which move the heatmap is displaying
        let heatmapLine = chartArea.append("line")
            .attr("visibility", "")
            .attr("x1", xScale(this.currentTime))
            .attr("x2", xScale(this.currentTime))
            .attr("y1", 0)
            .attr("y2", chartHeight)
            .attr("stroke", "rgba(0,0,0,0.5)")
            .attr("stroke-width", "2")
            .attr("stroke-dasharray", "4 2");

        // area for mouseover events
        let mouseover = chartArea.append("g")
            .attr("class", "mouseover")
            .attr("visibility", "hidden");

        // frame for the textbox
        const frame = mouseover.append("rect").attr("class", "frame")
            .attr("x", 0).attr("y", 0)
            .attr("rx", 5).attr("ry", 5)
            .attr("height", 70)
            .style("background-color", "#000000");

        // the textbox itself is not appended to the frame!
        const textbox = mouseover.append("g")
            .attr("transform", "translate(10,10)");

        // overlays an invisible rectangle for mouse events. 
        // this is necessary since prior to appending rect, chartArea is partially
        // transparent and mouse events on those regions won't be listened to 
        let activeRegion = mouseover.append("rect")
            .attr("id", "activeRegion")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("fill", "none")
            .attr("pointer-events", "all")
            .attr("visibility", "hidden");

        const graphType = this.graphType;  // function(){} changes what `this` is

        // glorious hacks to overcome JS's ever-shifting `this` keyword
        let self = this;
        function updateHeatmapSlider(time) {
            let oldCurrentTime = self.currentTime;
            self.currentTime = time;
            //if (self.currentTime !== oldCurrentTime) {
            heatmapLine
                .attr("x1", xScale(self.currentTime))
                .attr("x2", xScale(self.currentTime));
            self.redrawHeatmap();
            self.redrawSummary(isNormalized);
            //}
        }
        heatmapslider.on("input", function () { updateHeatmapSlider(this.value) });

        // updates the heatmap if the position of the `heatmapLine` has changed
        let updateHeatmapCursor = function (e) {
            let oldCurrentTime = self.currentTime;
            self.currentTime = Math.min(Math.max(Math.round(
                xScale.invert(d3.pointer(e)[0])
            ), xMin), xMax);

            if (self.currentTime !== oldCurrentTime) {
                heatmapLine
                    .attr("x1", xScale(self.currentTime))
                    .attr("x2", xScale(self.currentTime));

                updateHeatmapSlider(self.currentTime);
                heatmapslider.attr('value', self.currentTime)
            }
        }

        chartArea.on("mousedown", updateHeatmapCursor);

        //Draws text boxes
        //param e: the event to be drawn
        function drawTextBox(e) {
            // resets textbox contents and mouseover transforms
            textbox.html('');
            frame.attr("transform", `translate(0, 0)`);
            textbox.attr("transform", `translate(10, 10)`);

            let pointer = d3.pointer(e);
            let xInv = xScale.invert(pointer[0]);
            let yInv = yScale.invert(pointer[1]);

            let frameWidth = 150;
            frame.attr("width", frameWidth);

            if (pointer[0] <= frameWidth + 20) {
                frame.attr("transform", `translate(${chartWidth - frameWidth}, 0)`);
                textbox.attr("transform", `translate(${chartWidth - frameWidth + 10}, 10)`)
            }

            let x = Math.min(Math.max(Math.round(xInv), xMin), xMax); // closest x value

            let matchingBar =
                data.map(series =>
                    series.values.filter(
                        item => x === item.x && yInv <= item.y && yInv >= item.y0
                    ).map(x => ({ name: series.name, ...x }))
                ).filter(values => values.length > 0)
                    .map(values => values[0])[0];

            if (matchingBar !== undefined) {
                mouseover.attr("visibility", "");
                hoverLine.attr("visibility", "")
                    .attr("x1", xScale(matchingBar.x))
                    .attr("x2", xScale(matchingBar.x))
                    .attr("y1", yScale(matchingBar.y0))
                    .attr("y2", yScale(matchingBar.y))
                    .attr("stroke", "black")
                    .attr("stroke-width", 2);

                textbox.append("text")
                    .text(`Type: ${matchingBar.name}`)
                    .attr("x", 0).attr("y", 10);
                textbox.append("text")
                    .text(`Round: ${matchingBar.x}`)
                    .attr("x", 0).attr("y", 30);

                const LABELS = {
                    "normalizedStacked": "Percentage",
                    "stacked": "Count"
                }
                textbox.append("text")
                    .text( // if not normalized, round the number to 0 decimal places.
                        `${LABELS[graphType]}: ${LABELS[graphType] === "Percentage" ?
                            ((matchingBar.y - matchingBar.y0) * 100).toFixed(1) + "%" :
                            Math.round(matchingBar.y - matchingBar.y0)
                        }`
                    )
                    .attr("x", 0).attr("y", 50);
            } else {
                mouseover.attr("visibility", "hidden");
                hoverLine.attr("visibility", "hidden");
            }

        }

        chartArea.on("mousemove", drawTextBox);

        chartArea.on("mouseleave", function (e) {
            mouseover.attr("visibility", "hidden");
            hoverLine.attr("visibility", "hidden");
        });

        graph.append("path")
            .attr('d', d => areaGenerator(d.values))
            .attr("stroke-width", 1);

    }

    //Draws the line version of the data chart
    drawLine() {
        let {
            svg,
            width,
            height,
            margin,
            chartWidth,
            chartHeight,
            annotations,
            chartArea
        } = this.makeGraph("svg#time-series-graph", 30, 10, 50, 70, 'Move', 'temp');

        d3.select("#ChartyLabel").text("Frequency of " + this.convertTypetoText(this.dataSource))
        d3.select("#ChartTitle").text("Frequency of " + this.convertTypetoText(this.dataSource) + " at each Turn")

        const data = this.extractTimeSeriesData();
        let xMin = this.startTime;
        let xMax = this.endTime;
        let yMin = 0;
        let yMax = Math.max( // max of ys of everything selected in keyFilter
            ...data.map(d => Math.max(...d.values.map(v => v.y)))
        );

        // setting up scales
        let xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, chartWidth]);
        let yScale = d3.scaleLinear().domain([yMin, yMax]).range([chartHeight, 0]);
        let filterScale = d3.scaleOrdinal(d3.schemeCategory10);
        // setting up min/max of slider:
        let heatmapslider = d3.selectAll('#time');
        heatmapslider.attr('max', xMax).attr('min', xMin)
            .attr('value', this.currentTime);

        // setting up axes and grid lines
        // Y axis
        let leftAxis = d3.axisLeft(yScale)
            .tickFormat(d3.format(".6"));

        let leftGridlines = d3.axisLeft(yScale)
            .tickSize(-chartWidth - 10)
            .tickFormat("");

        annotations.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(" + (margin.left - 10) + "," + margin.top + ")")
            .call(leftAxis);
        annotations.append("g")
            .attr("class", "y gridlines")
            .attr("transform", "translate(" + (margin.left - 10) + "," + margin.top + ")")
            .call(leftGridlines);

        // X axis
        let bottomAxis = d3.axisBottom(xScale)
            .tickFormat(d3.format(".3"));

        let bottomGridlines = d3.axisBottom(xScale)
            .tickSize(-chartHeight - 10)
            .tickFormat("");

        annotations.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(" + margin.left + "," + (chartHeight + margin.top + 10) + ")")
            .call(bottomAxis);
        annotations.append("g")
            .attr("class", "x gridlines")
            .attr("transform", "translate(" + margin.left + "," + (chartHeight + margin.top + 10) + ")")
            .call(bottomGridlines);

        // line generator is for drawing lines on the graph later
        var lineGenerator = d3.line()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y));

        let graph = chartArea.selectAll('g.line')
            .data(data)
            .join('g')
            .attr('id', d => "g" + d.name)
            .attr("class", "line")
            .attr("stroke", d => filterScale(d.name))

        graph.append("path")
            .attr('d', d => lineGenerator(d.values))  // see above
            .attr("stroke-width", 2)
            .attr("fill", "none");

        // circles at each data point
        graph.selectAll("circle")
            .data(d => d.values)
            .join('circle')
            .attr("cx", d => xScale(d.x))
            .attr("cy", d => yScale(d.y))
            .attr("r", 1.5)
            .attr("fill", d => filterScale(d.name));

        // dotted line svg element that indicates which move the heatmap is displaying
        let heatmapLine = chartArea.append("line")
            .attr("visibility", "")
            .attr("x1", xScale(this.currentTime))
            .attr("x2", xScale(this.currentTime))
            .attr("y1", 0)
            .attr("y2", chartHeight)
            .attr("stroke", "rgba(0,0,0,0.5)")
            .attr("stroke-width", "2")
            .attr("stroke-dasharray", "4 2");

        // area for mouseover events
        let mouseover = chartArea.append("g")
            .attr("class", "mouseover")
            .attr("visibility", "hidden");

        // svg line element (solid black) that indicates which move the text box
        // in the line graph is detailing
        let hoverLine = mouseover.append("line")
            .attr("id", "xMarker")
            .attr("fill", "none")
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("y1", 0)
            .attr("y2", chartHeight)
            .attr("visibility", "hidden");

        // frame for the textbox
        const frame = mouseover.append("rect").attr("class", "frame")
            .attr("x", 0).attr("y", 0)
            .attr("rx", 5).attr("ry", 5)
            .attr("height", 70)
            .style("background-color", "#000000")
            .attr("transform", `translate(${chartWidth - 150},0)`);

        // the textbox itself is not appended to the frame!
        const textbox = mouseover.append("g")
            .attr("transform", `translate(${chartWidth - 140},10)`);;

        // overlays an invisible rectangle for mouse events. 
        // this is necessary since prior to appending rect, chartArea is partially
        // transparent and mouse events on those regions won't be listened to 
        let activeRegion = mouseover.append("rect")
            .attr("id", "activeRegion")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("fill", "none")
            .attr("pointer-events", "all")
            .attr("visibility", "hidden");

        // glorious hacks to overcome JS's ever-shifting `this` keyword
        let self = this;
        function updateHeatmapSlider(time) {
            let oldCurrentTime = self.currentTime;
            self.currentTime = time;
            //if (self.currentTime !== oldCurrentTime) {
            heatmapLine
                .attr("x1", xScale(self.currentTime))
                .attr("x2", xScale(self.currentTime));
            self.redrawHeatmap();
            //pass in false for isNormalized, and true for isLine
            self.redrawSummary(false, true);
            //}
        }
        heatmapslider.on("input", function () { updateHeatmapSlider(this.value) });

        // updates the heatmap if the position of the `heatmapLine` has changed
        let updateHeatmapCursor = function (e) {  // seen this somewhere? Too Bad!
            let oldCurrentTime = self.currentTime;
            self.currentTime = Math.min(Math.max(Math.round(
                xScale.invert(d3.pointer(e)[0])
            ), xMin), xMax);

            if (self.currentTime !== oldCurrentTime) {
                heatmapLine
                    .attr("x1", xScale(self.currentTime))
                    .attr("x2", xScale(self.currentTime));

                updateHeatmapSlider(self.currentTime);
                heatmapslider.attr('value', self.currentTime)
            }

        }
        // calls `updateHeatmapCursor` when a click (mousedown event) is detected
        chartArea.on("mousedown", updateHeatmapCursor);

        // when the mouse moves inside `chartArea`...
        function drawTextBox(e) {
            hoverLine.attr("visibility", "");
            textbox.html('');
            mouseover.attr("transform", `translate(0, 0)`);

            let pointer = d3.pointer(e); // pointer[0] is x position, pointer[y] is y position of the mouse
            let xInv = xScale.invert(pointer[0]);
            let yInv = yScale.invert(pointer[1]);

            let frameWidth = 150;
            frame.attr("width", frameWidth);

            let x = Math.min(Math.max(Math.round(xInv), xMin), xMax); // closest x value

            // finds closest points to the mouse position
            let matchingBars =
                data.map(series =>
                    series.values.filter(item => x === item.x)
                        .map(x => ({ name: series.name, ...x }))
                ).filter(values => values.length > 0)
                    .map(values => values[0]);

            if (matchingBars.length > 0) { // if any closest points were found...
                const matchingBar = matchingBars[0];
                mouseover.attr("visibility", "");
                hoverLine.attr("visibility", "")
                    .attr("x1", xScale(matchingBar.x))
                    .attr("x2", xScale(matchingBar.x))
                    .attr("stroke", "black")
                    .attr("stroke-width", 2);
                let textboxStartY = 10;
                textbox.append("text")
                    .text(`Round: ${matchingBar.x}`)
                    .attr("x", 0).attr("y", textboxStartY);

                for (const bar of matchingBars) { // put text in textbox with differing y
                    if (bar !== undefined) {
                        textbox.append("text")
                            .text(`${bar.name}: ${bar.y}`)
                            .attr("x", 0).attr("y", textboxStartY += 20);
                    }
                }

                // readjusts frame height to fit contents
                frame.attr("height", textboxStartY + 20);
            }
        }
        chartArea.on("mousemove", drawTextBox);

        // When the mouse leaves, hide the annotations
        chartArea.on("mouseleave", function () {
            hoverLine.attr("visibility", "hidden");
            mouseover.attr("visibility", "hidden")
        });

    }

    // updates checkboxes in filters (html) / keyFilter (this.keyFilter) whenever
    // a different data source is selected
    updateCheckboxes() {
        let ds = this.dataSource;
        let filtersElement = d3.select("#filters");
        if (ds === "destination") {
            filtersElement.style("width", "700px");
            // d3.select("#filtersDiv").style("width",  "700px !important");

        } else {
            filtersElement.style("width", "310px");
            // d3.select("#filtersDiv").style("width",  "700px !important");
        }

        d3.select("#filtersTitle").style("display", "block")
            .text(d => {
                switch (ds) {
                    case "pieceType":
                        return "Filter by Pieces:";
                    case "rows":
                        return "Filter by Rows:";
                    case "columns":
                        return "Filter by Columns:";
                    case "destination":
                        return "Filter by Destinations (Max 10):";
                }
            });

        filtersElement.html(""); // clear html element



        this.keyFilter.clear();

        this.data[ds].forEach((item) => {
            let checkboxDiv = filtersElement.append('div')
                .attr("class", "checkbox-div");

            checkboxDiv.append("input")
                .attr("type", "checkbox")
                .attr("name", item.name)
            //.attr("disabled", "true");

            checkboxDiv.append("label")
                .attr("for", item.name)
                .text(item.name);
        });

    }

}

const APP = new App();