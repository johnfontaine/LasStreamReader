/*jshint esversion: 6*/
/*jslint node: true */
 "use strict";
const models = require("./models.js");
const epsg = require("./epsg.json");
const proj4 = require("proj4");
const stream = require('stream');
const util = require('util');

class LasStreamReader extends stream.Transform {
    constructor(options) {
        super({readableObjectMode : true});
        this.point_record_options = {};
        this.read_header = false;
        this.read_vlr = false;
        this.got_projection = false;
        this.bytes_read = 0;
        this.header_buffer = Buffer.alloc(400);
        this.header_bytes_read = 0;
        this.point_record_options.transform_latlng = true;
        this.point_record_options.parse_full_point_record = true;
        this.is_laz = false;
        this.check_laz = false;
        this.check_classification_lookup = false;
        this.has_classification_lookup_table = false;
        if (options) {
            this.point_record_options.transform_lnglat = options.transform_lnglat === false ? false : true; // raw | scaled | wgs
            this.point_record_options.parse_full_point_record = options.parse_full_point_record || false;
            if (options.filter) {
                //include a filter;;
            }
            if (options.projection && options.projection.epsg_datum) {
                let epsg_code = epsg[String(options.projection.epsg_datum)];
                this.projection = {
                    epsg_datum :  options.projection.epsg_datum,
                    epsg_code : epsg_code,
                    convert_to_wgs84 : new proj4(epsg_code, proj4.defs('EPSG:4326'))
                };
                //igore VLR projection data and use this one instead.
                this.got_projection = true;
            }
        }
    }
    _transform(data, encoding, callback) {
        let size = data.length;
        let records = [];
        this.bytes_read += size;
        let chunk_start = this.bytes_read - size;
        let total = this.bytes_read;
        if (!this.read_header) {
            this._do_read_header(data, chunk_start);
        }

        if (this.read_header && !this.read_vlr) {
            this._do_read_vlr(data, chunk_start);
        }
        if (this.read_header && this.read_vlr) {
            if (this.is_laz) {
                callback("laszip is not supported yet");
                return;
            } else {
                this._do_read_records(data, chunk_start, callback);
            }
        } else {
            callback(null, records);
        }
    }
    _flush(callback) {
    //    console.log("invoke flush");
        callback();
    }
    _do_read_header(data, chunk_start) {
        this.header_bytes_read = fill_to_buffer(data, this.header_buffer, this.header_bytes_read);
        if (this.header_bytes_read === 400) {
            this.header = new models.Header(data.buffer);
            let offset = this.header.header_size;
            let start_point_data = this.header.offset_to_point_data;
            this.vlr_buffer = new Buffer.alloc(parseInt(start_point_data) - parseInt(offset));
            this.vlr_bytes_read = 0;
            this.read_header = true;
            this.points_data_size = ( this.header.point_data_record.length * this.header.points.number_of_points );
            this.points_data_read = 0;
            this.emit('onParseHeader', this.header);
        }
    }
    _do_read_vlr(data, chunk_start) {
        if (chunk_start < this.header.header_size) {
            this.vlr_bytes_read = fill_to_buffer(data.slice(this.header.header_size), this.vlr_buffer, this.vlr_bytes_read);
        } else {
            this.vlr_bytes_read = fill_to_buffer(data, this.vlr_buffer, this.vlr_bytes_read);
        }
        let vlr_remain =  this.vlr_buffer.length - this.vlr_bytes_read;
        if (vlr_remain === 0) {
            //console.log("getting variable length records",this.header.number_of_variable_length_records);
            this.vlr = [];
            let last_vlr_offset = 0;
            for (let i = 0; i < this.header.number_of_variable_length_records; i++) {
            //    console.log("last_vlr_offset is", last_vlr_offset);
                let d = this.vlr_buffer.buffer.slice(last_vlr_offset);
                //console.log(d.toString('utf8', 0, d.length));
                //console.log(d);
                let vlr = new models.VariableLengthRecordHeader(d);

                last_vlr_offset += vlr.record_length;
                this.vlr.push(vlr);
            }
            this.read_vlr = true;
            if (!this.check_laz) {
                let laz_vlr = this.vlr[this.vlr.length-1];
                this.is_laz = laz_vlr.user_id === 'laszip encoded';
                this.check_laz = true;
                if (this.is_laz) {
                    this.laz_info = new models.LazZipVlr(laz_vlr.data);
                    this.emit("onGotLazInfo", JSON.stringify(this.laz_info, null, "\t"));
                }
            }
            if (!this.check_classification_lookup) {
                check_classification_lookup(this);
            }
            this.emit('onParseVLR', this.vlr);
            if (!this.got_projection) {
                this.projection = computeProjection(this.vlr);
                if (this.projection) {
                    this.emit("onGotProjection", this.projection);
                }
            }
        }
    }
    _do_read_records(data, chunk_start, callback) {
        let local_buffer;
        let rec_size = this.header.point_data_record.length;
        if (chunk_start < this.header.offset_to_point_data) {
            local_buffer = data.buffer.slice(this.header.offset_to_point_data);
        } else {
            if (this.save_buffer) {
                let tmp_buffer = Buffer.concat([Buffer.from(this.save_buffer), data]);
                local_buffer = tmp_buffer.buffer;
            } else {
                local_buffer = data.buffer;
            }
        }
        let remainder = local_buffer.byteLength % rec_size;
        let end = local_buffer.byteLength-remainder;
        let proc_buffer = local_buffer.slice(0, end);
        this.points_data_read += proc_buffer.byteLength;
        if (remainder) {
            this.save_buffer = local_buffer.slice(end);
        } else {
            this.save_buffer = null;
        }
        let num_records = parseInt(proc_buffer.byteLength / rec_size);
        //console.log(`getting ${num_records} records from chunk`);
        let records = [];
        for (let i = 0; i < num_records; i++) {
            let start_rec = i * rec_size;
            let end_rec = (i + 1) * rec_size;
            records.push(
                new models.PointRecord(proc_buffer.slice(start_rec,end_rec), this.header, this.point_record_options, this.projection)
            );
        }

        if (this.points_data_read === this.points_data_size) {
            this.emit('onFinishedReadingRecords', this.header.points.number_of_points);
        }
        this.push(records);
        callback();
    }
}

function fill_to_buffer(in_buffer, fill_buffer, filled) {
    let remain = fill_buffer.length - filled;
    if (in_buffer.length >= remain) {
        fill_buffer.fill(in_buffer.slice(0, remain), filled);
        filled += remain;
    } else {
        fill_buffer.fill(in_buffer, filled);
        filled += in_buffer.length;
    }
    return filled;
}

function computeProjection(records) {
    for (let record of records) {
        if (record.is_projection()) {
            switch(Number(record.record_id)) {
                case 2111:
                    //OGC MATH TRANSFORM WKT RECORD:
                    //throw new Error("GC MATH TRANSFORM WKT RECORD record not supported");
                case 2112:
                    //OGC COORDINATE SYSTEM WKT
                    //throw new Error("OGC COORDINATE SYSTEM WKT record not supported");
                    break;
                case 34735:
                    return computeProjectionWithGeoTag(record);
                    //GEOTiff
            }
        }
    }

}
function check_classification_lookup(self) {
    for (let vlr of self.vlr) {
        if (vlr.record_id === 0 && vlr.user_id === 'LASF_Spec') {
            self.classification_table = new models.ClassificationTable(vlr.data);
        }
    }
    self.check_classification_lookup = true;
}
function computeProjectionWithGeoTag(record) {
//    console.log("record is", record);
    let projection = {convert_to_wgs84 : null};
    let geokey = new models.GeoKey(record.data);
    projection.geokey = geokey;
//    console.log("geokey", geokey);
    //get the EPSG code held in key 3072 or throw an error because this file lacks common decency.
    //See http://gis.stackexchange.com/questions/173111/converting-geotiff-projection-definition-to-proj4
    //todo: other projection options.
    //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.3.1
    let epsg_code;
    for (let key of geokey.keys) {
    //    console.log(`${key.wKeyId}\n\t`, JSON.stringify(key));
        if (Number(key.wKeyId) === 1024) {

        //    console.log("Model type key", key.wValue_Offset);
        }
        if (Number(key.wKeyId) === 2048) {
            if (key.wValue_Offset == 4326) {
                epsg_code = epsg[String(4326)];
                projection.epsg_datum = "EPSG:4326";
                projection.epsg_proj4 = epsg_code;
                projection.convert_to_wgs84 = new proj4(epsg_code, proj4.defs('EPSG:4326'));
            }
        }
        if (Number(key.wKeyId) === 3072) {
            epsg_code = epsg[String(key.wValue_Offset)];
            if (epsg_code && epsg_code !== "unknown") {
                projection.epsg_datum = String(key.wValue_Offset);
                projection.epsg_proj4 = epsg_code;
                projection.convert_to_wgs84 = new proj4(epsg_code, proj4.defs('EPSG:4326')); //to
            } else {
                let offset = key.wValue_Offset;
                throw new Error(`unable to compute projection for epsg code ${offset}`);
            }
        }
        if (Number(key.wKeyId) === 3076) {  //linearUnits key
            projection.linear_unit_key = String(key.wValue_Offset);
        }

        //VerticalCSTypeGeoKey
        //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.4.1
        if (Number(key.wKeyId)=== 4096) {
            projection.epsg_vertical_datum = key.wValue_Offset;
        }
        if (Number(key.wKeyId) == 4099) {
            projection.vertical_unit_key = String(key.wValue_Offset);
        }
    }
    if (!projection.convert_to_wgs84) {
        console.log("did not find projection");
        //throw new Error("unable to find ESPG code key 3072");
    }
    return projection;
}



module.exports = {
    models : models,
    LasStreamReader : LasStreamReader
};
