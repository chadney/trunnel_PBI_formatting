/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import * as d3 from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;
import { VisualSettings } from "./settings";



export interface TrunnelItem {

    category: string | number;
    measure: number;
    runSum: number;
    leafRunSum: number;
    isLeaf: boolean;

}



export interface TrunnelItems {

    items: TrunnelItem[];
    branchCategoryValues: string[];
    leafCategoryValues: string[];
    itemCount: number;
    branchesCount: number;
    leavesCount: number;
    branchesSum: number;
    leavesSum: number;

}




export class Visual implements IVisual {

    private svg: Selection<SVGElement>;
    private trunnelItems: TrunnelItems;
    private visualSettings: VisualSettings;


    private dataExtraction(dataView: DataView): TrunnelItems {

        let branchesSum: number = 0;
        let leavesSum: number = 0;
        let runSum: number = 0;
        let leafRunSum: number = 0;
        let isLeaf: boolean = false;

        let items = [];
        let categoryColumn = dataView.categorical.categories[0];
        let categoryValues = categoryColumn.values;
        let valueColumn = dataView.categorical.values[0];
        let valueValues = valueColumn.values;

        let itemCount: number = categoryValues.length;
        let leavesCount: number = this.visualSettings.dimensions.leavesCount;
        let branchesCount: number = itemCount - leavesCount;
        let branchCategoryValues = [];
        let leafCategoryValues = [];


        for (let i = 0; i < categoryValues.length; i++) {

            let category = categoryValues[i].valueOf() as string | number;
            let measure = valueValues[i].valueOf() as number;

            //leaves
            if (i > branchesCount - 1) {
                leavesSum += measure;
                isLeaf = true;
                leafCategoryValues.push(category);

            }
            //braches
            else {
                branchesSum += measure;
                branchCategoryValues.push(category);

            }


            let branch: TrunnelItem = {
                category,
                measure,
                runSum,
                leafRunSum,
                isLeaf
            }

            items.push(branch);

            runSum += measure;
            if (i > branchesCount - 1) {
                leafRunSum += measure;
            }


        }


        return {
            items, branchCategoryValues, leafCategoryValues, itemCount, branchesCount, leavesCount, branchesSum, leavesSum
        };



    }


    constructor(options: VisualConstructorOptions) {

        this.svg = d3.select(options.element)
            .append("svg")
            .classed("trunnel", true);

            this.visualSettings = <VisualSettings>VisualSettings.getDefault();
    }


    public update(options: VisualUpdateOptions) {


        // Set up the dimensions
        var viewPortWidth = options.viewport.width;
        var viewPortHeight = options.viewport.height;
        // Size the svg to the viewport dimension
        this.svg.attr("width", viewPortWidth);
        this.svg.attr("height", viewPortHeight);

        // Extract the data view data into the TrunnelItems data model
        let dataView: DataView = options.dataViews[0];
        this.visualSettings = VisualSettings.parse<VisualSettings>(dataView);
        let trunnelItems: TrunnelItems = this.dataExtraction(dataView);
        this.trunnelItems = trunnelItems;


        // Derive the remaining chart dimensions
        var yAxisWidth = this.visualSettings.leftAxis.leftAxisWidth;
        var yLeavesAxisWidth = this.visualSettings.rightAxis.rightAxisWidth;
        var xAxisHeight = this.visualSettings.topAxis.topAxisHeight;
        // Calculate the chart size without axes
        var width = viewPortWidth - (yAxisWidth + yLeavesAxisWidth);
        var height = viewPortHeight - xAxisHeight;
        // Size of trunk height and width and leaves height as percentage of chart size
        var trunkHeightPercent = this.visualSettings.dimensions.trunkHeight;
        var trunkWidthPercent =  this.visualSettings.dimensions.trunkWidth;
        var leavesHeightPercent =  this.visualSettings.dimensions.leavesHeight;
        // Branch spacing
        var branchSize = 1;
        // Calculate trunk height and width and leaves width
        var trunkHeight = height * trunkHeightPercent;
        var trunkWidth = width * trunkWidthPercent;
        var leaveWidth = width - trunkWidth;
        // Calculate the range for the leaves Y scale
        var leavesRangeStart = ((height / 2) * (1 - leavesHeightPercent));
        var leavesRangeEnd = height - leavesRangeStart;
        // Calculate the position of the top of the trunk
        var trunkTop = (height / 2) - (trunkHeight / 2);
        


        var trunkDomain = trunnelItems.branchesSum + trunnelItems.leavesSum;
        var leafCategoryValues = trunnelItems.leafCategoryValues;
        var branches = trunnelItems.branchesCount;
        var branchCategoryValues = trunnelItems.branchCategoryValues;
        var items = trunnelItems.itemCount;
        var data = trunnelItems.items;



        // Y scale maps the values to a portion of the trunk height
        var yScale = d3.scaleLinear()
            .domain([0, trunkDomain])
            .range([0, trunkHeight]);

        // Y scale leaves maps the leaf category values to a position on the leaves height
        var yScaleLeavesOrdinal = d3.scalePoint()
            .domain(leafCategoryValues)
            .range([leavesRangeStart, leavesRangeEnd]);


        // X scale maps the branch categories by position to a position on the trunk width

        var xScale = d3.scaleLinear()
            .domain([0, branches + 1])
            .range([trunkWidth / (branches + 1), trunkWidth]);

        // X scale ordinal maps the branch categories to a postion on the trunk width
        var xScaleOrdinal = d3.scalePoint()
            .domain(branchCategoryValues)
            .range([xScale(branchSize), xScale((branches - 1) + branchSize)]);

        // Colour scale maps each category to a colour within the specified range
        var colourScale = d3.scaleLinear<string, number>()
            .domain([0, items])
            .range([this.visualSettings.colours.startColour, this.visualSettings.colours.endColour]);

        var yAxis = d3.axisLeft(yScale);

        var xAxisOrdinal = d3.axisTop(xScaleOrdinal);

        var yAxisLeavesOrdinal = d3.axisRight(yScaleLeavesOrdinal);


        //Return a horizontal line for a data point.
        //This is just there to stop the appearance of blending lines.
        //It is otherwise identical to the horizontal portion of getLine below.
        var getHorizontal = function (d: TrunnelItem, i) {

            var xScalePosition = i;
            if (d.isLeaf) { xScalePosition = branches; }

            var trunkPos = yScale(d.runSum + (d.measure / 2)) + trunkTop;
            var moveToTop = "M 0, " + trunkPos + " ";
            var horizontalLine = "H " + xScale(xScalePosition) + " ";

            return moveToTop + horizontalLine;

        }


        // function to generate the path for each value
        var getLine =
            function (d, i) {

                // Get the mid point position on the yScale for this value.
                // Add in trunk top to position it below the start of the trunk top.
                var trunkPos = yScale(d.runSum + (d.measure / 2)) + trunkTop;
                var moveToTop = "M 0, " + trunkPos + " ";

                // If the value is a branch
                if (!d.isLeaf) {

                    // Get the X position of the end of the line from the xScale and generate horizontal
                    var horizontalLine = "H " + xScale(i) + " ";
                    // Get the position of the control points from the xScale and generate a bezier
                    var control1 = xScale(i + branchSize) + "," + trunkPos + " ";
                    var control2 = xScale(i + branchSize) + "," + trunkPos + " ";
                    var endPoint = xScale(i + branchSize) + "," + 0 + " ";

                }

                // for outcome values
                else {

                    // Get the position of the end of the line from the xScale and generate horizontal
                    var horizontalLine = "H " + xScale(branches) + " ";
                    // Get the Y position of the leaf end point
                    var yPosition = yScaleLeavesOrdinal(d.category);
                    // Generate the bezier 
                    var control1 = (trunkWidth + (leaveWidth / 2)) + "," + trunkPos + " ";
                    var control2 = (trunkWidth + (leaveWidth / 2)) + "," + yPosition + " ";
                    var endPoint = (width) + "," + yPosition + " ";

                }

                return moveToTop + horizontalLine + "C " + control1 + control2 + endPoint;

            }

        // Select the chart object
        
        //var chart = d3.select(".chart");
        var chart = this.svg;
        chart.selectAll("g").remove();



        // Add a container to hold the chart and move it below and right of the axis
        var container = chart.append("g")
            .attr("transform", "translate(" + yAxisWidth + ", " + xAxisHeight + ")");


        // Add an element for each data point
        var line = container.selectAll("g")
            .data(data)
            .enter()
            .append("g");


        // Set the path options and add the whole line

        line.append("path")
            .attr("stroke", function (d, i) { return colourScale(i) })
            .attr("stroke-width", function (d) { return yScale(d.measure) })
            .attr("fill", "none")
            .attr("shape-rendering", "geometricPrecision")
            .attr("d", getLine);

        // Set the path options and add the horizontal

        line.append("path")
            .attr("stroke", function (d, i) { return colourScale(i) })
            .attr("stroke-width", function (d) { return yScale(d.measure) })
            .attr("fill", "none")
            .attr("shape-rendering", "crispEdges")
            .attr("d", getHorizontal);

        // Add axes and translate them into place

        chart.append("g")
            .call(yAxis)
            .attr("class", "axis")
            .attr("transform", "translate(" + (yAxisWidth - 10) + ", " + (xAxisHeight + trunkTop) + ")");

        chart.append("g")
            .call(xAxisOrdinal)
            .attr("class", "axis")
            .attr("transform", "translate(" + (yAxisWidth) + ", " + (xAxisHeight - 5) + ")");

        chart.append("g")
            .call(yAxisLeavesOrdinal)
            .attr("class", "axis")
            .attr("transform", "translate(" + (yAxisWidth + width + 5) + ", " + (xAxisHeight) + ")");


    }


    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {

        var settings: VisualSettings = this.visualSettings;
        var enumeratedObjects: VisualObjectInstanceEnumerationObject = <VisualObjectInstanceEnumerationObject>VisualSettings.enumerateObjectInstances(settings,options);

        if (options.objectName === "dimensions") {


            enumeratedObjects.instances[0].validValues = {
                trunkWidth: { numberRange: { min: 0.2, max: 0.8 } },
                trunkHeight: { numberRange: { min: 0.2, max: 0.8 } },
                leavesHeight: { numberRange: { min: 0.2, max: 1 } },
                leavesCount: { numberRange: { min: 0, max: this.trunnelItems.itemCount } }

            };
        }

        return enumeratedObjects;

    }


}
