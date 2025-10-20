import LASParser from 'Parser/LASParser';
import Fetcher from 'Provider/Fetcher';
import Source from 'Source/Source';
import { CopcSource, EntwinePointTileSource } from 'Main';

/**
 * An object defining the source of Entwine Point Tile data. It fetches and
 * parses the main configuration file of Entwine Point Tile format,
 * [`ept.json`](https://entwine.io/entwine-point-tile.html#ept-json).
 *
 * @extends Source
 *
 * @property {boolean} isEntwinePointTileSource - Used to checkout whether this
 * source is a EntwinePointTileSource. Default is true. You should not change
 * this, as it is used internally for optimisation.
 * @property {string} url - The URL of the directory containing the whole
 * Entwine Point Tile structure.
 * @property {number[]} spacings @private Array containing all spacing values.
 */
class VpcSource extends Source {
    /**
     * @param {Object} config - The configuration, see {@link Source} for
     * available values.
     * @param {number} [config.colorDepth] - Color depth (in bits).
     * Either 8 or 16 bits. By defaults it will be set to 8 bits for LAS 1.2 and
     * 16 bits for later versions (as mandatory by the specification).
     */
    constructor(config) {
        super(config);

        this.isVpcSource = true;

        this.parser = LASParser.parseChunk;
        this.fetcher = Fetcher.arrayBuffer;

        this.colorDepth = config.colorDepth;

        this.spacings = [];

        const urlVpc = this.url;
        this.whenReady = Fetcher.json(urlVpc, this.networkOptions).then((metadata) => {
            this.urls = metadata.features.map(f => f.assets.data.href);

            this.metadata = metadata;
            const boundsConformings = metadata.features.map(f => f.properties['proj:bbox']);

            this.boundsConforming = [
                Math.min(...boundsConformings.map(b => b[0])),
                Math.min(...boundsConformings.map(b => b[1])),
                Math.min(...boundsConformings.map(b => b[2])),
                Math.max(...boundsConformings.map(b => b[3])),
                Math.max(...boundsConformings.map(b => b[4])),
                Math.max(...boundsConformings.map(b => b[5])),
            ];

            this.minElevation = this.boundsConforming[2];
            this.maxElevation = this.boundsConforming[5];

            /* FOR ONE proj:wkt2
            const projsWkt2 = meta.features.map(f => f.properties['proj:wkt2']);
            proj4.defs('unknown', projsWkt2[0]);
            let projCS;

            if (proj4.defs('unknown').type === 'COMPD_CS') {
                console.warn('CopcSource: compound coordinate system is not yet supported.');
                projCS = proj4.defs('unknown').PROJCS;
            } else {
                projCS = proj4.defs('unknown');
            }

            this.crs = projCS.title || projCS.name || 'EPSG:4326';
            if (!(this.crs in proj4.defs)) {
                proj4.defs(this.crs, projCS);
            }
            */

            this.sources = [];
            this.promises = [];
            this.urls.forEach((url, i) => {
                const p = new Promise((re, rj) => {
                    this.promises.push({ resolve: re, reject: rj });
                }).then((res) => {
                    this.sources[i] = res;
                    return res;
                }).catch((err) => {
                    console.warn(err);
                    this.handlingError(err);
                });

                const mockSource = {
                    url,
                    boundsConforming: boundsConformings[i],
                    whenReady: p,
                };
                this.sources.push(mockSource);
            });

            return this.sources;
        });
    }

    get spacing() {
        return this.spacings;
    }

    instanciate(index) {
        const url = this.urls[index];
        let source;
        if (url.includes('.copc')) {
            source = new CopcSource({ url });
        } else if (url.includes('.json')) {
            source = new EntwinePointTileSource({ url });
        } else {
            console.warn('Error: Stack format not supported');
            this.handlingError('Stack format not supported');
        }
        this.promises[index].resolve(source.whenReady);
    }
}

export default VpcSource;
