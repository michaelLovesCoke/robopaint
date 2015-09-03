/**
 * @file Holds all Robopaint media / color set related loading, parsing, etc
 * functionality.
 */
var robopaint = window.robopaint;
var fs = require('fs-plus');

robopaint.media = {
  /**
   * Fetches all colorsets available from the colorsets dir
   */
  load: function() {
    // TODO: Move this from colorsets to mediasets
    var colorsetDir = robopaint.appPath + 'resources/colorsets/';
    var files = fs.readdirSync(colorsetDir);
    var sets = [];

    // List all files, only add directories
    for(var i in files) {
      if (fs.statSync(colorsetDir + files[i]).isDirectory()) {
        sets.push(files[i]);
      }
    }

    this.sets = {};

    // Move through each colorset JSON definition file...
    for(var i in sets) {
      var set = sets[i];
      var setDir = colorsetDir + set + '/';


      try {
        var fileSets = require(setDir + set + '.json');
      } catch(e) {
        // Silently fail on bad parse!
        continue;
      }

       // Move through all colorsets in file
      for(var s in fileSets) {
        var c = fileSets[s];
        var machineName = c.machineName;

        try {
          // Add pure white to the end of the color set for auto-color
          c.colors.push({'white': '#FFFFFF'});

          // Process Colors to avoid re-processing later
          var colorsOut = [];
          for (var i in c.colors){
            var color = c.colors[i];
            var name = Object.keys(color)[0];
            var h = c.colors[i][name];
            var r = robopaint.utils.colorStringToArray(h);
            colorsOut.push({
              name: robopaint.t("colorsets.colors." + name),
              color: {
                HEX: h,
                RGB: r,
                HSL: robopaint.utils.rgbToHSL(r),
                YUV: robopaint.utils.rgbToYUV(r)
              }

            });
          }
        } catch(e) {
          console.error("Parse error on colorset: " + s, e);
          continue;
        }
        // Use the machine name and set name of the colorset to create translate
        // strings.
        var name  = "colorsets." + set + "." + machineName + ".name";
        var maker = "colorsets." + set + "." + machineName + ".manufacturer";
        var desc  = "colorsets." + set + "." + machineName + ".description";
        var media = "colorsets.media." + c.media;

        robopaint.media.sets[c.styles.baseClass] = {
          name: robopaint.t(name),
          type: robopaint.t(maker),
          weight: parseInt(c.weight),
          description: robopaint.t(desc),
          media: robopaint.t(media),
          enabled: robopaint.currentBot.allowedMedia[c.media],
          baseClass: c.styles.baseClass,
          colors: colorsOut,
          styleSrc: setDir + c.styles.src
        };
      }
    }

    this.setOrder = Object.keys(robopaint.media.sets).sort(function(a, b) {
      return (robopaint.media.sets[a].weight - robopaint.media.sets[b].weight)
    });
  },

  addStylesheet: function(setName) {
    var link = window.document.createElement('link');
      link.type = 'text/css';
      link.rel = 'stylesheet';
      link.href = robopaint.media.set[setName].styleSrc;
    window.document.head.appendChild(link);
  },

  get currentSet() {
    if (!this.sets) this.load();
    return this.sets[robopaint.settings.colorset];
  }
}
