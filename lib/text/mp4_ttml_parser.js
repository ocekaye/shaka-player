/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.text.Mp4TtmlParser');

goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');


/**
 * @implements {shaka.extern.TextParser}
 */
shaka.text.Mp4TtmlParser = class {
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.TtmlTextParser();

    /** @private {boolean} */
    this.supportsPartial_ = false;
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString('<tag></t', 'text/xml');
      this.supportsPartial_ = parsed.getElementsByTagName('tag').length > 0;
    } catch (e) {}
  }

  /** @override **/
  parseInit(data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawSTPP = false;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('stpp', (box) => {
          sawSTPP = true;
          box.parser.stop();
        }).parse(data);

    if (!sawSTPP) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }
  }

  /** @override */
  parseFirstCue(data, time) {
    return this.parseMediaInternal_(data, time, /* partial= */ true)[0];
  }

  /** @override **/
  parseMedia(data, time) {
    return this.parseMediaInternal_(data, time, /* partial= */ false);
  }

  /** @override */
  supportsPartial() {
    return this.supportsPartial_;
  }

  /**
   * @param {!Uint8Array} data
   * @param {shaka.extern.TextParser.TimeContext} time
   * @param {boolean} partial
   * @return {!Array.<!shaka.extern.Cue>}
   * @private
   */
  parseMediaInternal_(data, time, partial) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawMDAT = false;
    let payload = [];

    const parser = new Mp4Parser()
        .box('mdat', Mp4Parser.allData((data) => {
          sawMDAT = true;
          if (partial) {
            // Ignore any future MDAT boxes, if a cue has been found.
            payload = [this.parser_.parseFirstCue(data, time)];
            parser.stop();
          } else {
            // Join this to any previous payload, in case the mp4 has multiple
            // mdats.
            payload = payload.concat(this.parser_.parseMedia(data, time));
          }
        }));
    parser.parse(data, partial);

    if (!sawMDAT) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    return payload;
  }
};


shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', shaka.text.Mp4TtmlParser);
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.TTML.im1t"', shaka.text.Mp4TtmlParser);
