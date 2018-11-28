import _ from "lodash";

import Timer = NodeJS.Timer;
import jStat from "jStat";
export function getDeterministicRandomNumber(seed:number, range?:[number, number]) {
    // source: https://stackoverflow.com/a/23304189
    seed = Math.sin(seed)*10000;
    let r = seed - Math.floor(seed); // between 0 and 1
    if (range) {
        r = r*(range[1] - range[0]) + range[0];
    }
    return r;
}

function getSeedFromUniqueKey(uniqueKey:string) {
    let hash = 0, i, chr;
    if (uniqueKey.length === 0) return hash;
    for (i = 0; i < uniqueKey.length; i++) {
        chr   = uniqueKey.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export function getJitterForCase(uniqueKey:string) {
    const seed = getSeedFromUniqueKey(uniqueKey);
    return getDeterministicRandomNumber(seed, [-1,1]);
}


export function makeMouseEvents(self:{ tooltipModel: any, pointHovered: boolean}) {
    let disappearTimeout:Timer | null = null;
    const disappearDelayMs = 250;

    return [{
        target: "data",
        eventHandlers: {
            onMouseOver: () => {
                return [
                    {
                        target: "data",
                        mutation: (props: any) => {
                            self.tooltipModel = props;
                            self.pointHovered = true;

                            if (disappearTimeout !== null) {
                                clearTimeout(disappearTimeout);
                                disappearTimeout = null;
                            }

                            return { active: true };
                        }
                    }
                ];
            },
            onMouseOut: () => {
                return [
                    {
                        target: "data",
                        mutation: () => {
                            if (disappearTimeout !== null) {
                                clearTimeout(disappearTimeout);
                            }

                            disappearTimeout = setTimeout(()=>{
                                self.pointHovered = false;
                            }, disappearDelayMs);

                            return { active: false };
                        }
                    }
                ];
            }
        }
    }];
}

export function makeScatterPlotSizeFunction<D>(
    highlight?:(d:D)=>boolean,
    size?:number | ((d:D, active:Boolean, isHighlighted?:boolean)=>number)
) {
    // need to regenerate this function whenever highlight changes in order to trigger immediate Victory rerender
    if (size) {
        if (highlight && typeof size === "function") {
            return (d:D, active:boolean)=>size(d, active, highlight(d));
        } else {
            return size;
        }
    } else {
        return (d:D, active:boolean)=>{
            return (active || !!(highlight && highlight(d)) ? 6 : 3);
        };
    }
}

export function scatterPlotSize(
    d:any,
    active:boolean,
    isHighlighted:boolean
) {
    if (isHighlighted) {
        return 8;
    } else if (active) {
        return 6;
    } else {
        return 4;
    }
}

function darkenHexChannel(c:string) {
    let cNum = parseInt(c, 16);
    cNum *= 0.95;
    cNum = Math.round(cNum);
    c = cNum.toString(16);
    if (c.length === 1) {
        c = '0' + c;
    }
    return c;
};
function darkenHexColor(str:string) {
    let r = str[1] + str[2];
    let g = str[3] + str[4];
    let b = str[5] + str[6];
    r = darkenHexChannel(r);
    g = darkenHexChannel(g);
    b = darkenHexChannel(b);
    return '#' + r + g + b;
};

export function makeUniqueColorGetter(init_used_colors?:string[]) {
    init_used_colors = init_used_colors || [];
    const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618",
        "#990099", "#0099c6", "#dd4477", "#66aa00",
        "#b82e2e", "#316395", "#994499", "#22aa99",
        "#aaaa11", "#6633cc", "#e67300", "#8b0707",
        "#651067", "#329262", "#5574a6", "#3b3eac",
        "#b77322", "#16d620", "#b91383", "#f4359e",
        "#9c5935", "#a9c413", "#2a778d", "#668d1c",
        "#bea413", "#0c5922", "#743411"]; // Source: D3
    let index = 0;
    const used_colors:{[color:string]:boolean} = {};
    for (const color of init_used_colors) {
        used_colors[color] = true;
    }
    return function() {
        // return unused color
        var next_color = colors[index % colors.length];
        while (used_colors[next_color]) {
            var darker_next_color = darkenHexColor(next_color);
            if (darker_next_color === next_color) {
                break;
            }
            next_color = darker_next_color;
        }
        used_colors[next_color] = true;
        index += 1;

        return next_color;
    };
};

export function separateScatterDataByAppearance<D>(
    data:D[],
    fill:string | ((d:D)=>string),
    stroke:string | ((d:D)=>string),
    strokeWidth:number | ((d:D)=>number),
    strokeOpacity:number | ((d:D)=>number),
    fillOpacity:number | ((d:D)=>number),
    zIndexSortBy?:((d:D)=>any)[] // second argument to _.sortBy
):{
    data:D[],
    fill:string,
    stroke:string,
    strokeWidth:number,
    strokeOpacity:number,
    fillOpacity:number
}[] {
    let buckets:{
        data:D[],
        fill:string,
        stroke:string,
        strokeWidth:number,
        strokeOpacity:number,
        fillOpacity:number,
        sortBy:any[]
    }[] = [];

    let d_fill:string, d_stroke:string, d_strokeWidth:number, d_strokeOpacity:number, d_fillOpacity:number,
        d_sortBy:any[], bucketFound:boolean;

    for (const datum of data) {
        // compute appearance for datum
        d_fill = (typeof fill === "function" ? fill(datum) : fill);
        d_stroke = (typeof stroke === "function" ? stroke(datum) : stroke);
        d_strokeWidth = (typeof strokeWidth === "function" ? strokeWidth(datum) : strokeWidth);
        d_strokeOpacity = (typeof strokeOpacity === "function" ? strokeOpacity(datum) : strokeOpacity);
        d_fillOpacity = (typeof fillOpacity === "function" ? fillOpacity(datum) : fillOpacity);
        d_sortBy = (zIndexSortBy ? zIndexSortBy.map(f=>f(datum)) : [1]);

        // look for existing bucket to put datum
        bucketFound = false;
        for (const bucket of buckets) {
            if (bucket.fill === d_fill && bucket.stroke === d_stroke && bucket.strokeWidth === d_strokeWidth &&
                    bucket.strokeOpacity === d_strokeOpacity && bucket.fillOpacity === d_fillOpacity &&
                    _.isEqual(bucket.sortBy, d_sortBy)) {
                // if bucket with matching appearance exists, add to bucket
                bucket.data.push(datum);
                // mark bucket has been found so we dont need to add a bucket
                bucketFound = true;
                break;
            }
        }
        if (!bucketFound) {
            // if no bucket found, add bucket, and put datum in it
            buckets.push({
                data: [datum],
                fill: d_fill, stroke: d_stroke, strokeWidth: d_strokeWidth,
                strokeOpacity: d_strokeOpacity, fillOpacity: d_fillOpacity,
                sortBy: d_sortBy
            });
        }
    }

    if (zIndexSortBy) {
        // sort by sortBy
        const sortBy = zIndexSortBy.map((f, index)=>((bucket:typeof buckets[0])=>bucket.sortBy[index]));
        buckets = _.sortBy<typeof buckets[0]>(buckets, sortBy);
    }
    return buckets;
}

export function computeCorrelationPValue(correlation:number, numSamples:number) {
    const R = correlation;
    if (Math.abs(R) === 1) {
        return 0;
    }

    const n = numSamples;
    if (n > 2) {
        // degrees of freedom has to be > 0
        const tStatistic = Math.abs(R)*Math.sqrt((n - 2) / (1 - R*R)); // we know |R| < 1 so no divide by zero risk

        // 2-sided t-test
        // have to pass in n-1 as # samples argument, to get jStat to internally use a t distribution with (n-2) DOF
        return jStat.ttest(tStatistic, n-1, 2);
    } else {
        return null;
    }
}