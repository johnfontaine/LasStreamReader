/*jshint esversion: 6*/
/*jslint node: true */
 "use strict";
const models = require("./models.js");
const epsg = require("./epsg.json");
const proj4 = require("proj4");
const stream = require('stream');
const util = require('util');

const linear_unit_defs = {
  9001 : function(value) {
    return Number(value);
    //Linear_Meter
  },
  9002 : function(value) {
    //Linear_Foot
    return Number(value) * 0.3048;
  },
  9003 : function(value) {
    //Linear_Foot_US_Survey
    return Number(value) * ( 1200/3937 );
  },
  9004 : function(value) {
    //Linear_Foot_Modified_American =	9004
    return Number(value) * ( 1200/3937 );
  },
  9005 : function(value) {
    //Linear_Foot_Clarke = 9005
    return value * 0.3047972654;
  },
  9006 : function(value) {
    //Linear_Foot_Indian =	9006
    return value * 0.3047995 ;
  },
  9007 : function(value) {
    //Linear_Link =	9007
    return value * 0.201168;
  }
  /* TODO add these mostly unused units of measure.
  Linear_Link_Benoit =	9008
  Linear_Link_Sears =	9009
  Linear_Chain_Benoit =	9010
  Linear_Chain_Sears =	9011
  Linear_Yard_Sears =	9012
  Linear_Yard_Indian =	9013
  Linear_Fathom =	9014
  Linear_Mile_International_Nautical =	9015
  */
};

const proj4_linear_units_def = {
  9001 : "m",
  9002 : 'ft',
  9003 : "us-ft"
};

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
                    convert_to_wgs84 : new proj4(epsg_code, proj4.defs('EPSG:4326')),
                    convert_elevation_to_meters  : function(value) { return value }
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
            this.vlr = [];
            let last_vlr_offset = 0;
            for (let i = 0; i < this.header.number_of_variable_length_records; i++) {
                let d = this.vlr_buffer.buffer.slice(last_vlr_offset);
                let vlr = new models.VariableLengthRecordHeader(d);

                last_vlr_offset += vlr.record_length;
                this.vlr.push(vlr);
            }
            this.read_vlr = true;
            if (!this.check_laz && this.vlr.length > 0) {
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
                if (this.vlr.length === 0) {
                    this.emit("error", new Error('Unable to determine projection from variable length records'));
                } else {
                    this.projection = computeProjection(this.vlr);
                    if (this.projection && this.projection.convert_to_wgs84) {
                        this.emit("onGotProjection", this.projection);
                    } else {
                        this.emit("error", new Error("invalid projection\n" + JSON.stringify(this.projection, null, " ")));
                    }
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

function computeProjection(records) { //variable length records
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
                    return computeProjectionWithGeoTag(record, records);
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

function computeProjectionWithGeoTag(record,records) {
//    console.log("record is", record);
    let projection = {
      convert_to_wgs84 : null,
      convert_elevation_to_meters : function(value) { return value; },
      convert_linear_to_meters : function(value) { return value; }
    };
    let geokey = new models.GeoKey(record.data);
    projection.geokey = geokey;
//    console.log("geokey", geokey);
    //get the EPSG code held in key 3072 or throw an error because this file lacks common decency.
    //See http://gis.stackexchange.com/questions/173111/converting-geotiff-projection-definition-to-proj4
    //todo: other projection options.
    //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.3.1
    let epsg_code;
    for (let key of geokey.keys) {
        let keyId = Number(key.wKeyId);
        let tagLocation = Number(key.wTIFFTagLocation);
        if (tagLocation === 34736) {
            //34736 means the data is located at index wValue_Offset of the
            //GeoDoubleParamsTag record.
        } else {
            //34767 means the data is located at index wValue_Offset of the
            //GeoAsciiParamsTag record.
        }
    //    console.log(`${key.wKeyId}\n\t`, JSON.stringify(key));
        if (keyId === 1024) {

        //    console.log("Model type key", key.wValue_Offset);
        }
        if (keyId === 2048) {
            if (key.wValue_Offset == 4326) {
                epsg_code = epsg[String(4326)];
                projection.epsg_datum = "EPSG:4326";
                projection.epsg_proj4 = epsg_code;
                if (projection.linear_unit_key) {
                    let replace_units = "+units=" + proj4_linear_units_def[projection.linear_unit_key];
                    projection.epsg_proj4 = projection.epsg_proj4.replace("+units=m", replace_units);
                }
                projection.convert_to_wgs84 = new proj4(projection.epsg_proj4, proj4.defs('EPSG:4326'));
            }
        }
        if (keyId === 3072) {
            epsg_code = String(epsg[String(key.wValue_Offset)]);
            if (epsg_code && epsg_code !== "unknown") {
                projection.epsg_datum = String(key.wValue_Offset);
                projection.epsg_proj4 = epsg_code;
                if (projection.linear_unit_key) {
                    let replace_units = "+units=" + proj4_linear_units_def[projection.linear_unit_key];
                    projection.epsg_proj4 = projection.epsg_proj4.replace("+units=m", replace_units);
                }
                projection.convert_to_wgs84 = new proj4(projection.epsg_proj4, proj4.defs('EPSG:4326')); //to
            } else {
                let offset = key.wValue_Offset;
                throw new Error(`unable to compute projection for epsg code ${offset}`);
            }
        }
        if (keyId === 3076) {  //linearUnits key
            projection.linear_unit_key = String(key.wValue_Offset);
            projection.convert_linear_to_meters =  linear_unit_defs[projection.linear_unit_key];
            if (projection.epsg_proj4) {
                let replace_units = "+units=" + proj4_linear_units_def[projection.linear_unit_key];
                projection.epsg_proj4 = projection.epsg_proj4.replace("+units=m", replace_units);
                projection.convert_to_wgs84 = new proj4(projection.epsg_proj4, proj4.defs('EPSG:4326')); //to
            }
        }

        //VerticalCSTypeGeoKey
        //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.4.1
        if (keyId === 4096) {
            projection.epsg_vertical_datum = key.wValue_Offset;
        }
        if (keyId === 4099) {
            projection.vertical_unit_key = String(key.wValue_Offset);
            projection.convert_elevation_to_meters = linear_unit_defs[projection.vertical_unit_key];
        }

    }
    return projection;
}



module.exports = {
    models : models,
    LasStreamReader : LasStreamReader
};
