import { FEATURE_TYPES } from 'Core/Feature';
import Cache from 'Core/Scheduler/Cache';
import Fetcher from 'Provider/Fetcher';
import * as mapbox from '@mapbox/mapbox-gl-style-spec';
import { Color } from 'three';
import { deltaE } from 'Renderer/Color';

import itowns_stroke_single_before from './StyleChunk/itowns_stroke_single_before.css';

export const cacheStyle = new Cache();

const inv255 = 1 / 255;
const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : {};
const style_properties = {};

function mapPropertiesFromContext(mainKey, from, to, context) {
    to[mainKey] = to[mainKey] || {};
    for (const key of style_properties[mainKey]) {
        const value = readExpression(from[mainKey][key], context);
        if (value !== undefined) {
            to[mainKey][key] = value;
        }
    }
}

export function readExpression(property, ctx) {
    if (property != undefined) {
        if (property.expression) {
            return property.expression.evaluate(ctx);
        } else if (property.stops) {
            for (let i = property.stops.length - 1; i >= 0; i--) {
                const stop = property.stops[i];

                if (ctx.globals.zoom >= stop[0]) {
                    return stop[1];
                }
            }
            return property.stops[0][1];
        } else if (property instanceof Function) {
            return property(...Object.values(ctx.specifics).map(specific => specific()));
        } else {
            return property;
        }
    }
}

function rgba2rgb(orig) {
    if (!orig) {
        return {};
    } else if (orig.stops || orig.expression) {
        return { color: orig };
    } else if (typeof orig == 'string') {
        const result = orig.match(/(?:((hsl|rgb)a? *\(([\d.%]+(?:deg|g?rad|turn)?)[ ,]*([\d.%]+)[ ,]*([\d.%]+)[ ,/]*([\d.%]*)\))|(#((?:[\d\w]{3}){1,2})([\d\w]{1,2})?))/i);
        if (!result) {
            return { color: orig, opacity: 1.0 };
        } else if (result[7]) {
            let opacity = 1.0;
            if (result[9]) {
                opacity = parseInt(result[9].length == 1 ? `${result[9]}${result[9]}` : result[9], 16) * inv255;
            }
            return { color: `#${result[8]}`, opacity };
        } else if (result[0]) {
            return { color: `${result[2]}(${result[3]},${result[4]},${result[5]})`, opacity: (Number(result[6]) || 1.0) };
        }
    }
}

function readVectorProperty(property, options) {
    if (property != undefined) {
        if (mapbox.expression.isExpression(property)) {
            return mapbox.expression.createExpression(property, options).value;
        } else {
            return property.base || property;
        }
    }
}

async function loadImage(source) {
    let promise = cacheStyle.get(source, 'null');
    if (!promise) {
        promise = Fetcher.texture(source, { crossOrigin: 'anonymous' });
        cacheStyle.set(promise, source, 'null');
    }
    return (await promise).image;
}

function drawImage(img, cropValues = { width: img.naturalWidth, height: img.naturalHeight }) {
    canvas.width = cropValues.width;
    canvas.height = cropValues.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img,
        cropValues.x || 0, cropValues.y || 0, cropValues.width, cropValues.height,
        0, 0, cropValues.width, cropValues.height);
    return ctx.getImageData(0, 0, cropValues.width, cropValues.height);
}

async function getImage(source, options) {
    if (!options.cropValues && !options.color) {
        return source;
    }
    const img = options.img || await loadImage(source);
    let imgd = drawImage(img, options.cropValues);
    if (options.color) {
        const imgdColored = cacheStyle.get(options.id || source, options.color);
        if (!imgdColored) {
            const pix = imgd.data;
            const color = new Color(options.color);
            const colorToChange = new Color('white');
            for (let i = 0, n = pix.length; i < n; i += 4) {
                const d = deltaE(pix.slice(i, i + 3), colorToChange) / 100;
                pix[i] = (pix[i] * d +  color.r * 255 * (1 - d));
                pix[i + 1] = (pix[i + 1] * d +  color.g * 255 * (1 - d));
                pix[i + 2] = (pix[i + 2] * d +  color.b * 255 * (1 - d));
            }
            cacheStyle.set(imgd, options.id || source, options.color);
        } else {
            imgd = imgdColored;
        }
    }
    canvas.getContext('2d').putImageData(imgd, 0, 0);

    return canvas.toDataURL('image/png');
}

const textAnchorPosition = {
    left: [0, -0.5],
    right: [-1, -0.5],
    top: [-0.5, 0],
    bottom: [-0.5, -1],
    'top-right': [-1, 0],
    'bottom-left': [0, -1],
    'bottom-right': [-1, -1],
    center: [-0.5, -0.5],
    'top-left': [0, 0],
};

function defineStyleProperty(style, category, name, value, defaultValue) {
    let property;

    Object.defineProperty(
        style[category],
        name,
        {
            enumerable: true,
            get: () => property ?? defaultValue,
            set: (v) => {
                property = v;
            },
        });

    style[category][name] = value;
}

/**
 * @typedef {Object} StyleOptions
 * @memberof StyleOptions
 *
 * @property {number} [order] - Order of the features that will be associated to
 * the style. It can helps sorting and prioritizing features if needed.
 *
 * @property {Object} [zoom] - Level on which to display the feature
 * @property {number} [zoom.max] - max level
 * @property {number} [zoom.min] - min level
 *
 * @property {Object} [fill] - Fill style for polygons.
 * @property {string|function|THREE.Color} [fill.color] - Defines the main fill color. Can be
 * any [valid color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, which means no fill.
 * If the `Layer` is a `GeometryLayer` you can use `THREE.Color`.
 * @property {Image|Canvas|string|object|function} [fill.pattern] - Defines a pattern to fill the
 * surface with. It can be an `Image` to use directly, an url to fetch the pattern or an object containing
 * the url of the image to fetch and the transformation to apply.
 * from. See [this example] (http://www.itowns-project.org/itowns/examples/#source_file_geojson_raster)
 * for how to use.
 * @property {string} [fill.pattern.source] the url to fetch the pattern image
 * @property {object} [fill.pattern.cropValues] the x, y, width and height (in pixel) of the sub image to use.
 * @property {THREE.Color} [fill.pattern.color] Can be any [valid color string]
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * It will change the color of the white pixels of the source image.
 * @property {number|function} [fill.opacity] - The opacity of the color or of the
 * pattern. Can be between `0.0` and `1.0`. Default is `1.0`.
 * For a `GeometryLayer`, this opacity property isn't used.
 * @property {number|function} [fill.base_altitude] - `GeometryLayer` style option, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 * @property {number|function} [fill.extrusion_height] - `GeometryLayer` style option, if defined,
 * polygons will be extruded by the specified amount
 *
 * @property {Object} [stroke] - Lines and polygons edges.
 * @property {string|function|THREE.Color} [stroke.color] The color of the line. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, which means no stroke.
 * If the `Layer` is a `GeometryLayer` you can use `THREE.Color`.
 * @property {number|function} [stroke.opacity] - The opacity of the line. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * For a `GeometryLayer`, this opacity property isn't used.
 * @property {number|function} [stroke.width] - The width of the line. Default is `1.0`.
 * @property {number|function} [stroke.base_altitude] - `GeometryLayer` style option, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 *
 * @property {Object} [point] - Point style.
 * @property {string|function} [point.color] - The color of the point. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, which means points won't be displayed.
 * @property {number|function} [point.radius] - The radius of the point, in pixel. Default
 * is `2.0`.
 * @property {string|function} [point.line] - The color of the border of the point. Can be
 * any [valid color
 * string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Not supported for a `GeometryLayer`.
 * @property {number|function} [point.width] - The width of the border, in pixel. Default
 * is `0.0` (no border).
 * @property {number|function} [point.opacity] - The opacity of the point. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * Not supported for `GeometryLayer`.
 * @property {number|function} [point.base_altitude] - `GeometryLayer` style option, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 * @property {Object} [point.model] - 3D model to instantiate at each point position.
 *
 * @property {Object} [text] - All things {@link Label} related.
 * @property {string|function} [text.field] - A string representing a property key of
 * a `FeatureGeometry` enclosed in brackets, that will be replaced by the value of the
 * property for each geometry. For example, if each geometry contains a `name` property,
 * `text.field` can be set to `{name}`. Default is no value, indicating that no
 * text will be displayed.
 *
 * It's also possible to create more complex expressions. For example, you can combine
 * text that will always be displayed (e.g. `foo`) and variable properties (e.g. `{bar}`)
 * like the following: `foo {bar}`. You can also use multiple variables in one field.
 * Let's say for instance that you have two properties latin name and local name of a
 * place, you can write something like `{name_latin} - {name_local}` which can result
 * in `Marrakesh - مراكش` for example.
 * @property {string|function} [text.color] - The color of the text. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is `#000000`.
 * @property {string|number[]|function} [text.anchor] - The anchor of the text compared to its
 * position (see {@link Label} for the position). Can be one of the following values: `top`,
 * `left`, `bottom`, `right`, `center`, `top-left`, `top-right`, `bottom-left`
 * or `bottom-right`. Default is `center`.
 *
 * It can also be defined as an Array of two numbers. Each number defines an offset (in
 * fraction of the label width and height) between the label position and the top-left
 * corner of the text. The first value is the horizontal offset, and the second is the
 * vertical offset. For example, `[-0.5, -0.5]` will be equivalent to `center`.
 * @property {Array|function} [text.offset] - The offset of the text, depending on its
 * anchor, in pixels. First value is from `left`, second is from `top`. Default
 * is `[0, 0]`.
 * @property {number|function} [text.padding] - The padding outside the text, in pixels.
 * Default is `2`.
 * @property {number|function} [text.size] - The size of the font, in pixels. Default is
 * `16`.
 * @property {number|function} [text.wrap] - The maximum width, in pixels, before the text
 * is wrapped, because the string is too long. Default is `10`.
 * @property {number|function} [text.spacing] - The spacing between the letters, in `em`.
 * Default is `0`.
 * @property {string|function} [text.transform] - A value corresponding to the [CSS
 * property
 * `text-transform`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform).
 * Default is `none`.
 * @property {string|function} [text.justify] - A value corresponding to the [CSS property
 * `text-align`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-align).
 * Default is `center`.
 * @property {number|function} [text.opacity] - The opacity of the text. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * @property {Array|function} [text.font] - A list (as an array of string) of font family
 * names, prioritized in the order it is set. Default is `Open Sans Regular,
 * Arial Unicode MS Regular, sans-serif`.
 * @property {string|function} [text.haloColor] - The color of the halo. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is `#000000`.
 * @property {number|function} [text.haloWidth] - The width of the halo, in pixels.
 * Default is `0`.
 * @property {number|function} [text.haloBlur] - The blur value of the halo, in pixels.
 * Default is `0`.
 *
 * @property {Object} [icon] - Defines the appearance of icons attached to label.
 * @property {string} [icon.source] - The url of the icons' image file.
 * @property {string} [icon.id] - The id of the icons' sub-image in a vector tile data set.
 * @property {string} [icon.cropValues] - the x, y, width and height (in pixel) of the sub image to use..
 * @property {string} [icon.anchor] - The anchor of the icon compared to the label position.
 * Can be `left`, `bottom`, `right`, `center`, `top-left`, `top-right`, `bottom-left`
 * or `bottom-right`. Default is `center`.
 * @property {number} [icon.size] - If the icon's image is passed with `icon.source` and/or
 * `icon.id`, its size when displayed on screen is multiplied by `icon.size`. Default is `1`.
 * @property {string|function} [icon.color] - The color of the icon. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * It will change the color of the white pixels of the icon source image.
 * @property {number|function} [icon.opacity] - The opacity of the icon. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
*/

/**
 * @description An object that can contain any properties
 * (order, zoom, fill, stroke, point, text or/and icon)
 * and sub properties of a Style.<br/>
 * Used for the instanciation of a {@link Style}.
 * @hideconstructor
 */
export class StyleOptions {}

/**
 * @class
 * @classdesc A Style is a class that defines the visual appearance of {@link
 * FeatureCollection} and {@link Feature}. It is taken into account when drawing
 * them in textures that will be placed onto tiles.
 *
 * As there are five basic elements present in `Features`, there are also five
 * main components in a `Style` object:
 * - `fill` is for all fillings and polygons
 * - `stroke` is for all lines and polygons edges
 * - `point` is for all points
 * - `text` contains all {@link Label} related things
 * - `icon` defines the appearance of icons attached to label.
 *
 * Many style property can be set to functions. When that is the case, the function's
 * return type must necessarily be the same as the types (other than function) of the property.
 * For instance, if the `fill.pattern` property is set to a function, this function must return
 * an `Image`, a `Canvas`, or `String`.
 * The first parameter of functions used to set `Style` properties is always an object containing
 * the properties of the features displayed with the current `Style` instance.
 *
 * @property {number} order - Order of the features that will be associated to
 * the style. It can helps sorting and prioritizing features if needed.
 * @property {Object} fill - Polygons and fillings style.
 * @property {string|function|THREE.Color} fill.color - Defines the main color of the filling. Can be
 * any [valid color
 * string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, indicating that no filling needs to be done.
 * If the `Layer` is a `GeometryLayer` you can use `THREE.Color`.
 * @property {Image|Canvas|string|function} fill.pattern - Defines a pattern to fill the
 * surface with. It can be an `Image` to use directly, or an url to fetch the
 * pattern from. See [this
 * example](http://www.itowns-project.org/itowns/examples/#source_file_geojson_raster)
 * for an example.
 * @property {number|function} fill.opacity - The opacity of the color or of the
 * pattern. Can be between `0.0` and `1.0`. Default is `1.0`.
 * For a `GeometryLayer`, this opacity property isn't used.
 * @property {number|function} fill.base_altitude - Only for {@link GeometryLayer}, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 * @property {number|function} fill.extrusion_height - Only for {@link GeometryLayer}, if defined,
 * polygons will be extruded by the specified amount
 * @property {Object} stroke - Lines and polygons edges.
 * @property {string|function|THREE.Color} stroke.color The color of the line. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, indicating that no stroke needs to be done.
 * If the `Layer` is a `GeometryLayer` you can use `THREE.Color`.
 * @property {number|function} stroke.opacity - The opacity of the line. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * For a `GeometryLayer`, this opacity property isn't used.
 * @property {number|function} stroke.width - The width of the line. Default is `1.0`.
 * @property {number|function} stroke.base_altitude - Only for {@link GeometryLayer}, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 *
 * @property {Object} point - Point style.
 * @property {string|function} point.color - The color of the point. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is no value, indicating that no point will be shown.
 * @property {number|function} point.radius - The radius of the point, in pixel. Default
 * is `2.0`.
 * @property {string|function} point.line - The color of the border of the point. Can be
 * any [valid color
 * string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Not supported for `GeometryLayer`.
 * @property {number|function} point.width - The width of the border, in pixel. Default
 * is `0.0` (no border).
 * @property {number|function} point.opacity - The opacity of the point. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * Not supported for `GeometryLayer`.
 * @property {number|function} point.base_altitude - Only for {@link GeometryLayer}, defines altitude
 * for each coordinate.
 * If `base_altitude` is `undefined`, the original altitude is kept, and if it doesn't exist
 * then the altitude value is set to 0.
 * @property {Object} point.model - 3D model to instantiate at each point position

 *
 * @property {Object} text - All things {@link Label} related.
 * @property {string|function} text.field - A string representing a property key of
 * a `FeatureGeometry` enclosed in brackets, that will be replaced by the value of the
 * property for each geometry. For example, if each geometry contains a `name` property,
 * `text.field` can be set to `{name}`. Default is no value, indicating that no
 * text will be displayed.
 *
 * It's also possible to create more complex expressions. For example, you can combine
 * text that will always be displayed (e.g. `foo`) and variable properties (e.g. `{bar}`)
 * like the following: `foo {bar}`. You can also use multiple variables in one field.
 * Let's say for instance that you have two properties latin name and local name of a
 * place, you can write something like `{name_latin} - {name_local}` which can result
 * in `Marrakesh - مراكش` for example.
 * @property {string|function} text.color - The color of the text. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is `#000000`.
 * @property {string|number[]|function} text.anchor - The anchor of the text relative to its
 * position (see {@link Label} for the position). Can be one of the following values: `top`,
 * `left`, `bottom`, `right`, `center`, `top-left`, `top-right`, `bottom-left`
 * or `bottom-right`. Default is `center`.
 *
 * It can also be defined as an Array of two numbers. Each number defines an offset (in
 * fraction of the label width and height) between the label position and the top-left
 * corner of the text. The first value is the horizontal offset, and the second is the
 * vertical offset. For example, `[-0.5, -0.5]` will be equivalent to `center`.
 * @property {Array|function} text.offset - The offset of the text, depending on its
 * anchor, in pixels. First value is from `left`, second is from `top`. Default
 * is `[0, 0]`.
 * @property {number|function} text.padding - The padding outside the text, in pixels.
 * Default is `2`.
 * @property {number|function} text.size - The size of the font, in pixels. Default is
 * `16`.
 * @property {number|function} text.wrap - The maximum width, in pixels, before the text
 * is wrapped, because the string is too long. Default is `10`.
 * @property {number|function} text.spacing - The spacing between the letters, in `em`.
 * Default is `0`.
 * @property {string|function} text.transform - A value corresponding to the [CSS
 * property
 * `text-transform`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform).
 * Default is `none`.
 * @property {string|function} text.justify - A value corresponding to the [CSS property
 * `text-align`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-align).
 * Default is `center`.
 * @property {number|function} text.opacity - The opacity of the text. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 * @property {Array|function} text.font - A list (as an array of string) of font family
 * names, prioritized in the order it is set. Default is `Open Sans Regular,
 * Arial Unicode MS Regular, sans-serif`.
 * @property {string|function} text.haloColor - The color of the halo. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * Default is `#000000`.
 * @property {number|function} text.haloWidth - The width of the halo, in pixels.
 * Default is `0`.
 * @property {number|function} text.haloBlur - The blur value of the halo, in pixels.
 * Default is `0`.
 *
 * @property {Object} icon - Defines the appearance of icons attached to label.
 * @property {string} icon.source - The url of the icons' image file.
 * @property {string} icon.id - The id of the icons' sub-image in a vector tile data set.
 * @property {string} icon.cropValues - the x, y, width and height (in pixel) of the sub image to use.
 * @property {string} icon.anchor - The anchor of the icon compared to the label position.
 * Can be `left`, `bottom`, `right`, `center`, `top-left`, `top-right`, `bottom-left`
 * or `bottom-right`. Default is `center`.
 * @property {number} icon.size - If the icon's image is passed with `icon.source` and/or
 * `icon.id`, its size when displayed on screen is multiplied by `icon.size`. Default is `1`.
 * @property {string|function} icon.color - The color of the icon. Can be any [valid
 * color string](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value).
 * It will change the color of the white pixels of the icon source image.
 * @property {number|function} icon.opacity - The opacity of the icon. Can be between
 * `0.0` and `1.0`. Default is `1.0`.
 *
 * @example
 * const style = new itowns.Style({
 *      stroke: { color: 'red' },
 *      point: { color: 'white', line: 'red' },
 * });
 *
 * const source = new itowns.FileSource(...);
 *
 * const layer = new itowns.ColorLayer('foo', {
 *      source: source,
 *      style: style,
 * });
 *
 * view.addLayer(layer);
 */

class Style {
    /**
     * @param {StyleOptions} [params={}] An object that contain any properties
     * (order, zoom, fill, stroke, point, text or/and icon)
     * and sub properties of a Style (@see {@link StyleOptions}).
     * @constructor
     */
    constructor(params = {}) {
        this.isStyle = true;

        this.order = 0;

        params.zoom = params.zoom || {};
        params.fill = params.fill || {};
        params.stroke = params.stroke || {};
        params.point = params.point || {};
        params.text = params.text || {};
        params.icon = params.icon || {};

        this.zoom = {};
        defineStyleProperty(this, 'zoom', 'min', params.zoom.min);
        defineStyleProperty(this, 'zoom', 'max', params.zoom.max);

        this.fill = {};
        defineStyleProperty(this, 'fill', 'color', params.fill.color);
        defineStyleProperty(this, 'fill', 'opacity', params.fill.opacity, 1.0);
        defineStyleProperty(this, 'fill', 'pattern', params.fill.pattern);
        defineStyleProperty(this, 'fill', 'extrusion_height', params.fill.extrusion_height);

        this.stroke = {};
        defineStyleProperty(this, 'stroke', 'color', params.stroke.color);
        defineStyleProperty(this, 'stroke', 'opacity', params.stroke.opacity, 1.0);
        defineStyleProperty(this, 'stroke', 'width', params.stroke.width, 1.0);
        defineStyleProperty(this, 'stroke', 'dasharray', params.stroke.dasharray, []);

        this.point = {};
        defineStyleProperty(this, 'point', 'color', params.point.color);
        defineStyleProperty(this, 'point', 'line', params.point.line);
        defineStyleProperty(this, 'point', 'opacity', params.point.opacity, 1.0);
        defineStyleProperty(this, 'point', 'radius', params.point.radius, 2.0);
        defineStyleProperty(this, 'point', 'width', params.point.width, 0.0);
        defineStyleProperty(this, 'point', 'model', params.point.model);

        this.text = {};
        defineStyleProperty(this, 'text', 'field', params.text.field);
        defineStyleProperty(this, 'text', 'zOrder', params.text.zOrder, 'auto');
        defineStyleProperty(this, 'text', 'color', params.text.color, '#000000');
        defineStyleProperty(this, 'text', 'anchor', params.text.anchor, 'center');
        defineStyleProperty(this, 'text', 'offset', params.text.offset, [0, 0]);
        defineStyleProperty(this, 'text', 'padding', params.text.padding, 2);
        defineStyleProperty(this, 'text', 'size', params.text.size, 16);
        defineStyleProperty(this, 'text', 'placement', params.text.placement, 'point');
        defineStyleProperty(this, 'text', 'rotation', params.text.rotation, 'auto');
        defineStyleProperty(this, 'text', 'wrap', params.text.wrap, 10);
        defineStyleProperty(this, 'text', 'spacing', params.text.spacing, 0);
        defineStyleProperty(this, 'text', 'transform', params.text.transform, 'none');
        defineStyleProperty(this, 'text', 'justify', params.text.justify, 'center');
        defineStyleProperty(this, 'text', 'opacity', params.text.opacity, 1.0);
        defineStyleProperty(this, 'text', 'font', params.text.font, ['Open Sans Regular', 'Arial Unicode MS Regular', 'sans-serif']);
        defineStyleProperty(this, 'text', 'haloColor', params.text.haloColor, '#000000');
        defineStyleProperty(this, 'text', 'haloWidth', params.text.haloWidth, 0);
        defineStyleProperty(this, 'text', 'haloBlur', params.text.haloBlur, 0);

        this.icon = {};
        defineStyleProperty(this, 'icon', 'source', params.icon.source);
        defineStyleProperty(this, 'icon', 'id', params.icon.id);
        defineStyleProperty(this, 'icon', 'cropValues', params.icon.id);
        defineStyleProperty(this, 'icon', 'anchor', params.icon.anchor, 'center');
        defineStyleProperty(this, 'icon', 'size', params.icon.size, 1);
        defineStyleProperty(this, 'icon', 'color', params.icon.color);
        defineStyleProperty(this, 'icon', 'opacity', params.icon.opacity, 1.0);
    }

    /**
     * Map drawing properties style (fill, stroke and point) from context to object.
     * Only the necessary properties are mapped to object.
     * if a property is expression, the mapped value will be the expression result depending on context.
     * @param      {Object}  context  The context
     * @return     {Style}  mapped style depending on context.
     */
    drawingStylefromContext(context) {
        const style = {};
        if (this.fill.color || this.fill.pattern || context.globals.fill) {
            if (typeof this.fill.pattern === 'string') {
                this.fill.pattern = { source: this.fill.pattern };
            }
            mapPropertiesFromContext('fill', this, style, context);
        }
        if (this.stroke.color || context.globals.stroke) {
            mapPropertiesFromContext('stroke', this, style, context);
        }
        if (this.point.color || this.point.model || context.globals.point) {
            mapPropertiesFromContext('point', this, style, context);
        }
        if (Object.keys(style).length) {
            return style;
        }
    }

    /**
     * Map symbol properties style (symbol and icon) from context to object.
     * Only the necessary properties are mapped to object.
     * if a property is expression, the mapped value will be the expression result depending on context.
     * @param      {Object}  context  The context
     * @return     {Object}  mapped style depending on context.
     */
    symbolStylefromContext(context) {
        const style = {};
        if (this.text) {
            mapPropertiesFromContext('text', this, style, context);
        }
        if (this.icon) {
            mapPropertiesFromContext('icon', this, style, context);
        }
        style.order = this.order;
        return style;
    }

    /**
     * Copies the content of the target style into this style.
     *
     * @param {Style} style - The style to copy.
     *
     * @return {Style} This style.
     */
    copy(style) {
        Object.assign(this.fill, style.fill);
        Object.assign(this.stroke, style.stroke);
        Object.assign(this.point, style.point);
        Object.assign(this.text, style.text);
        Object.assign(this.icon, style.icon);
        return this;
    }

    /**
     * Clones this style.
     *
     * @return {Style} The new style, cloned from this one.
     */
    clone() {
        const clone = new Style();
        return clone.copy(this);
    }

    /**
     * instanciate a Style based on 2 style_Interface, prioritazing for
     * each properties the first style in the list
     * @param {StyleOptions} styleHigh first object style with higher priority.
     * @param {StyleOptions} styleLow object style with lower priority.
     * @param {Object} context The feature context.
     * @returns {Style} the merged Style instance.
     */
    static merge(styleHigh = {}, styleLow, context) {
        let styleLowRead = styleLow;
        if (styleLow instanceof Function) {
            styleLowRead = readExpression(styleLow, context);
        }
        const styleConc = {
            fill: {
                ...styleLowRead.fill,
                ...styleHigh.fill,
            },
            stroke: {
                ...styleLowRead.stroke,
                ...styleHigh.stroke,
            },
            point: {
                ...styleLowRead.point,
                ...styleHigh.point,
            },
            icon: {
                ...styleLowRead.icon,
                ...styleHigh.icon,
            },
            text: {
                ...styleLowRead.text,
                ...styleHigh.text,
            },
            order: styleHigh.order || styleLowRead.order,
        };
        return new Style(styleConc);
    }

    /**
     * set Style from (geojson-like) properties.
     * @param {object} properties (geojson-like) properties.
     * @param {number} type
     * @returns {StyleOptions} containing all properties for itowns.Style
     */
    static setFromProperties(properties, type) {
        const style = {};
        if (type === FEATURE_TYPES.POINT) {
            const point = {
                ...(properties.fill !== undefined && { color: properties.fill }),
                ...(properties['fill-opacity'] !== undefined && { opacity: properties['fill-opacity'] }),
                ...(properties.stroke !== undefined && { line: properties.stroke }),
                ...(properties.radius !== undefined && { radius: properties.radius }),
            };
            if (Object.keys(point).length) {
                style.point = point;
            }
            const text = {
                ...(properties['label-color'] !== undefined && { color: properties['label-color'] }),
                ...(properties['label-opacity'] !== undefined && { opacity: properties['label-opacity'] }),
                ...(properties['label-size'] !== undefined && { size: properties['label-size'] }),
            };
            if (Object.keys(point).length) {
                style.text = text;
            }
            const icon = {
                ...(properties.icon !== undefined && { source: properties.icon }),
                ...(properties['icon-scale'] !== undefined && { size: properties['icon-scale'] }),
                ...(properties['icon-opacity'] !== undefined && { opacity: properties['icon-opacity'] }),
                ...(properties['icon-color'] !== undefined && { color: properties['icon-color'] }),
            };
            if (Object.keys(icon).length) {
                style.icon = icon;
            }
        } else {
            const stroke = {
                ...(properties.stroke !== undefined && { color: properties.stroke }),
                ...(properties['stroke-width'] !== undefined && { width: properties['stroke-width'] }),
                ...(properties['stroke-opacity'] !== undefined && { opacity: properties['stroke-opacity'] }),
            };
            if (Object.keys(stroke).length) {
                style.stroke = stroke;
            }
            if (type !== FEATURE_TYPES.LINE) {
                const fill = {
                    ...(properties.fill !== undefined && { color: properties.fill }),
                    ...(properties['fill-opacity'] !== undefined && { opacity: properties['fill-opacity'] }),
                };
                if (Object.keys(fill).length) {
                    style.fill = fill;
                }
            }
        }
        return style;
    }

    /**
     * set Style from vector tile layer properties.
     * @param {object} layer vector tile layer.
     * @param {Object} sprites vector tile layer.
     * @param {number} [order=0]
     * @param {boolean} [symbolToCircle=false]
     * @returns {StyleOptions} containing all properties for itowns.Style
     */
    static setFromVectorTileLayer(layer, sprites, order = 0, symbolToCircle = false) {
        const style = {
            fill: {},
            stroke: {},
            point: {},
            text: {},
            icon: {},
        };

        layer.layout = layer.layout || {};
        layer.paint = layer.paint || {};

        style.order = order;

        if (layer.type === 'fill') {
            const { color, opacity } = rgba2rgb(readVectorProperty(layer.paint['fill-color'] || layer.paint['fill-pattern'], { type: 'color' }));
            style.fill.color = color;
            style.fill.opacity = readVectorProperty(layer.paint['fill-opacity']) || opacity;
            if (layer.paint['fill-pattern'] && sprites) {
                style.fill.pattern = {
                    id: layer.paint['fill-pattern'],
                    source: sprites.source,
                    cropValues: sprites[layer.paint['fill-pattern']],
                };
            }

            if (layer.paint['fill-outline-color']) {
                const { color, opacity } = rgba2rgb(readVectorProperty(layer.paint['fill-outline-color'], { type: 'color' }));
                style.stroke.color = color;
                style.stroke.opacity = opacity;
                style.stroke.width = 1.0;
                style.stroke.dasharray = [];
            }
        } else if (layer.type === 'line') {
            const prepare = readVectorProperty(layer.paint['line-color'], { type: 'color' });
            const { color, opacity } = rgba2rgb(prepare);
            style.stroke.dasharray = readVectorProperty(layer.paint['line-dasharray']);
            style.stroke.color = color;
            style.stroke.lineCap = layer.layout['line-cap'];
            style.stroke.width = readVectorProperty(layer.paint['line-width']);
            style.stroke.opacity = readVectorProperty(layer.paint['line-opacity']) || opacity;
        } else if (layer.type === 'circle' || symbolToCircle) {
            const { color, opacity } = rgba2rgb(readVectorProperty(layer.paint['circle-color'], { type: 'color' }));
            style.point.color = color;
            style.point.opacity = opacity;
            style.point.radius = readVectorProperty(layer.paint['circle-radius']);
        } else if (layer.type === 'symbol') {
            // overlapping order
            style.text.zOrder = readVectorProperty(layer.layout['symbol-z-order']);
            if (style.text.zOrder == 'auto') {
                style.text.zOrder = readVectorProperty(layer.layout['symbol-sort-key']) || 'Y';
            } else if (style.text.zOrder == 'viewport-y') {
                style.text.zOrder = 'Y';
            } else if (style.text.zOrder == 'source') {
                style.text.zOrder = 0;
            }

            // position
            style.text.anchor = readVectorProperty(layer.layout['text-anchor']);
            style.text.offset = readVectorProperty(layer.layout['text-offset']);
            style.text.padding = readVectorProperty(layer.layout['text-padding']);
            style.text.size = readVectorProperty(layer.layout['text-size']);
            style.text.placement = readVectorProperty(layer.layout['symbol-placement']);
            style.text.rotation = readVectorProperty(layer.layout['text-rotation-alignment']);

            // content
            style.text.field = readVectorProperty(layer.layout['text-field']);
            style.text.wrap = readVectorProperty(layer.layout['text-max-width']);
            style.text.spacing = readVectorProperty(layer.layout['text-letter-spacing']);
            style.text.transform = readVectorProperty(layer.layout['text-transform']);
            style.text.justify = readVectorProperty(layer.layout['text-justify']);

            // appearance
            const { color, opacity } = rgba2rgb(readVectorProperty(layer.paint['text-color'], { type: 'color' }));
            style.text.color = color;
            style.text.opacity = readVectorProperty(layer.paint['text-opacity']) || (opacity !== undefined && opacity);

            style.text.font = readVectorProperty(layer.layout['text-font']);
            const haloColor = readVectorProperty(layer.paint['text-halo-color'], { type: 'color' });
            if (haloColor) {
                style.text.haloColor = haloColor.color || haloColor;
                style.text.haloWidth = readVectorProperty(layer.paint['text-halo-width']);
                style.text.haloBlur = readVectorProperty(layer.paint['text-halo-blur']);
            }

            // additional icon
            const key = readVectorProperty(layer.layout['icon-image']);
            if (key) {
                style.icon.key = key;
                style.icon.size = readVectorProperty(layer.layout['icon-size']) || 1;
                const { color, opacity } = rgba2rgb(readVectorProperty(layer.paint['icon-color'], { type: 'color' }));
                style.icon.color = color;
                style.icon.opacity = readVectorProperty(layer.paint['icon-opacity']) || (opacity !== undefined && opacity);
            }
        }
        return style;
    }

    /**
     * Applies the style.fill to a polygon of the texture canvas
     * @param {CanvasRenderingContext2D} txtCtx The Context 2D of the texture canvas
     * @param {DOMMatrix} matrix The DOM matrix scaled to generate pattenr (if any)
     * @param {DOMMatrix} invCtxScale The DOM matrix scaled to generate pattenr (if any)
     * @param {Path2D} polygon The current texture canvas polygon
     */
    async applyToCanvasPolygon(txtCtx, matrix, invCtxScale, polygon) {
        // if (this.fill.pattern && ctx.fillStyle.src !== this.fill.pattern.src) {
        // need doc for the ctx.fillStyle.src that seems to always be undefined
        if (this.fill.pattern) {
            let img = this.fill.pattern;
            if (this.fill.pattern.source) {
                img = await loadImage(this.fill.pattern.source);
            }
            drawImage(img, this.fill.pattern.cropValues);

            txtCtx.fillStyle = txtCtx.createPattern(canvas, 'repeat');
            if (txtCtx.fillStyle.setTransform) {
                txtCtx.fillStyle.setTransform(matrix.scale(invCtxScale));
            } else {
                console.warn('Raster pattern isn\'t completely supported on Ie and edge', txtCtx.fillStyle);
            }
        } else if (txtCtx.fillStyle !== this.fill.color) {
            txtCtx.fillStyle = this.fill.color;
        }
        if (this.fill.opacity !== txtCtx.globalAlpha) {
            txtCtx.globalAlpha = this.fill.opacity;
        }
        txtCtx.fill(polygon);
    }

    /**
     * Applies this style to a DOM element. Limited to the `text` and `icon`
     * properties of this style.
     *
     * @param {Element} domElement - The element to set the style to.
     */
    async applyToHTML(domElement) {
        domElement.style.padding = `${this.text.padding}px`;
        domElement.style.maxWidth = `${this.text.wrap}em`;

        domElement.style.color = this.text.color;
        if (this.text.size > 0) {
            domElement.style.fontSize = `${this.text.size}px`;
        }

        domElement.style.fontFamily = this.text.font.join(',');
        domElement.style.textTransform = this.text.transform;
        domElement.style.letterSpacing = `${this.text.spacing}em`;
        domElement.style.textAlign = this.text.justify;
        domElement.style['white-space'] = 'pre-line';

        if (this.text.haloWidth > 0) {
            domElement.style.setProperty('--text_stroke_display', 'block');
            domElement.style.setProperty('--text_stroke_width', `${this.text.haloWidth}px`);
            domElement.style.setProperty('--text_stroke_color', this.text.haloColor);
            domElement.setAttribute('data-before', domElement.textContent);
        }

        if (!this.icon.source) {
            return;
        }

        const icon = document.createElement('img');
        const options = {
            id: this.icon.id,
            color: this.icon.color,
            cropValues: this.icon.cropValues,
        };
        icon.src = await getImage(this.icon.source, options);

        const addIcon = () => {
            const cIcon = icon.cloneNode();

            cIcon.setAttribute('class', 'itowns-icon');

            cIcon.width = icon.width * this.icon.size;
            cIcon.height = icon.height * this.icon.size;
            cIcon.style.color = this.icon.color;
            cIcon.style.opacity = this.icon.opacity;
            cIcon.style.position = 'absolute';
            cIcon.style.top = '0';
            cIcon.style.left = '0';

            switch (this.icon.anchor) { // center by default
                case 'left':
                    cIcon.style.top = `${-0.5 * cIcon.height}px`;
                    break;
                case 'right':
                    cIcon.style.top = `${-0.5 * cIcon.height}px`;
                    cIcon.style.left = `${-cIcon.width}px`;
                    break;
                case 'top':
                    cIcon.style.left = `${-0.5 * cIcon.width}px`;
                    break;
                case 'bottom':
                    cIcon.style.top = `${-cIcon.height}px`;
                    cIcon.style.left = `${-0.5 * cIcon.width}px`;
                    break;
                case 'bottom-left':
                    cIcon.style.top = `${-cIcon.height}px`;
                    break;
                case 'bottom-right':
                    cIcon.style.top = `${-cIcon.height}px`;
                    cIcon.style.left = `${-cIcon.width}px`;
                    break;
                case 'top-left':
                    break;
                case 'top-right':
                    cIcon.style.left = `${-cIcon.width}px`;
                    break;
                case 'center':
                default:
                    cIcon.style.top = `${-0.5 * cIcon.height}px`;
                    cIcon.style.left = `${-0.5 * cIcon.width}px`;
                    break;
            }

            cIcon.style['z-index'] = -1;
            domElement.appendChild(cIcon);
            icon.removeEventListener('load', addIcon);
        };

        if (icon.complete) {
            addIcon();
        } else {
            icon.addEventListener('load', addIcon);
        }
        return icon;
    }

    /**
     * Gets the values corresponding to the anchor of the text. It is
     * proportions, to use with a `translate()` and a `transform` property.
     *
     * @return {number[]} Two percentage values, for x and y respectively.
     */
    getTextAnchorPosition() {
        if (typeof this.text.anchor === 'string') {
            if (Object.keys(textAnchorPosition).includes(this.text.anchor)) {
                return textAnchorPosition[this.text.anchor];
            } else {
                console.error(`${this.text.anchor} is not a valid input for Style.text.anchor parameter.`);
                return textAnchorPosition.center;
            }
        } else {
            return this.text.anchor;
        }
    }

    /**
     * Returns a string, associating `style.text.field` and properties to use to
     * replace the keys in `style.text.field`.
     *
     * @param {Object} ctx - An object containing the feature context.
     *
     * @return {string|undefined} The formatted string if `style.text.field` is defined, nothing otherwise.
     */
    getTextFromProperties(ctx) {
        if (!this.text.field) { return; }

        if (this.text.field.expression) {
            return readExpression(this.text.field, ctx);
        } else {
            return this.text.field.replace(/\{(.+?)\}/g, (a, b) => (ctx.specifics.properties()[b] || '')).trim();
        }
    }
}

// Add custom style sheet with iTowns specifics
const CustomStyle = {
    itowns_stroke_single_before,
};

const customStyleSheet = (typeof document !== 'undefined') ? document.createElement('style') : {};
customStyleSheet.type = 'text/css';

Object.keys(CustomStyle).forEach((key) => {
    customStyleSheet.innerHTML += `${CustomStyle[key]}\n\n`;
});

if (typeof document !== 'undefined') {
    document.getElementsByTagName('head')[0].appendChild(customStyleSheet);
}

const style = new Style();

style_properties.fill = Object.keys(style.fill);
style_properties.stroke = Object.keys(style.stroke);
style_properties.point = Object.keys(style.point);
style_properties.text = Object.keys(style.text);
style_properties.icon = Object.keys(style.icon);

export default Style;
