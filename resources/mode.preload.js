/**
 * @file File preloaded in node-context for every RP Mode to give them mode API
 * components and variables. Replaces previous AMD style Require.js code.
 *
 * Globals made here are invisible to the window, but vars added to window will
 * become globals in the window. A generic mode CSS file is also added.
 *
 * Modes will be provided the following window "globals":
 * - i18n: The full i18next CommonJS client module, loaded with the modes full
 *          translation set, and the RP central translations for common strings.
 * - app: The electron app object from the main process.
 * - rpRequire: The helper function for adding RP "modules", external libraries,
 *              and any otthaer cothode o
 * - ipc: The Inter Process Communication module for sending events and messages
 *        to/from the main window process. Most of this is managed here, but
 *        having this globally available makes custom comms possible.
 * - cncserver: Just the clientside API wrappers for cncserver.
 * - robopaint: A limited version of the robopaint object. Contains:
 *        settings (read only), utils, canvas, cncserver.
 * - robopaint.pauseTillEmpty(init) : Tell RoboPaint to pause the cncserver
 *        buffer until after pauseTillEmpty(false) has been called, and the
 *        local push buffer to the main buffer has been emptied.
 * - mode: Package of the current mode, with path, and utility functions.
 *    * mode.run({mixed}): Emulation IPC passthrough of original commander
 *        API shortcut. Allows immediate queuing of ~500 cmds/sec to CNCServer.
 *    * mode.settings: An object with setters/getters to manage storing this
 *        modes specific settings.
 *    * mode.settings.$manage(selectors): A full settings management system for
 *        form elements. List the selectors for each input element you want to
 *        track, and from one call this will load, track changes & save all
 *        values automagically keyed on the elements ID!
 *
 *    This is also where event callbacks should be defined, full list here:
 *     * mode.translateComplete(): Called whenever translate is done. Happens on
 *         init, and after every language change.
 *     * mode.onPenUpdate(actualPen): Called when the bot actually moves the
 *         the object will contain the full CNCServer pen object of where it
 *         should or will be after the "lastDuration" key value.
 *     * mode.onCallbackEvent(name): When a "callbackname" is run into the
 *         buffer and eventually run, this will fire with the name given.
 *     * mode.bindControls(): A handly function to store all your control button
 *         bindings, called when the page is fully loaded & translation is done.
 *     * mode.onClose(callback): Called whenever the user attempts to either
 *         change the mode, or close the application. If implemented, the user
 *         can only close or change the mode once "callback" has been called.
 *     * mode.onFullyResumed() & mode.onFullyPaused(): A mode can run pause or
 *         resume, but doesn't know when this happens until these are called.
 *     * mode.onMessage(channel, data): For any undefined gen events, wraps ipc.
 *     * mode.fullCancel(message): Standardized full cancel, buffer clear and
 *         park with passed status message.
 **/
"use strict";

var remote = require('remote');
var path = require('path');
var app = window.app = remote.require('app');
var fs = require('fs-plus');
var ipc = window.ipc = require('ipc');
var appPath = app.getAppPath();
var i18n = window.i18n = require('i18next-client');
var $ = require('jquery');
var _ = require('underscore');
var rpRequire = window.rpRequire = require(appPath + '/resources/rp_modules/rp.require');

// Get our absolute mode path passed in the location hash, and get the mode's
// package.json, and load it.
var modePath = path.parse(decodeURIComponent(location.hash.substr(1)));
var mode = window.mode = require(path.join(modePath.dir, 'package.json'));
mode.path = modePath;

// Load the central RP settings
var robopaint = window.robopaint = {
  utils: rpRequire('utils'),
  appPath: appPath + path.sep,
  t: i18n.t
};

robopaint.settings = robopaint.utils.getSettings();
rpRequire('cnc_api', function(){
  window.cncserver.api.server = robopaint.utils.getAPIServer(robopaint.settings);
  robopaint.cncserver = window.cncserver;
  robopaint.cncserver.api.settings.bot(function(b){
    robopaint.canvas = robopaint.utils.getRPCanvas(b);
    robopaint.currentBot = robopaint.utils.getCurrentBot(b);
    preloadComplete(); // This should be the last thing to run in preload.
  });
});

// Add in a small API for getting and setting the SVG content, as the storage
// may change, but the API shouldn't need to.
robopaint.svg = {
  wrap: function(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    robopaint.canvas.width + '" height= "' + robopaint.canvas.height + '">' +
    inner + '</svg>';
  },
  isEmpty: function() {
    return localStorage['svgedit-default'] == false;
  },
  load: function() {
    return localStorage['svgedit-default'];
  },
  save: function(svgData) {
    localStorage['svgedit-default'] = svgData;
  }
}

// Add an API for pausing CNCServer till all commands are fully buffered.
robopaint.pauseTillEmpty = function(starting) {
  ipc.sendToHost('cncserver', 'pauseTillEmpty', starting);
}

// Add the generic mode CSS for body drop shadow and basic button formatting.
$('<link>').attr({
  href: robopaint.appPath + "resources/styles/modes.css",
  rel: "stylesheet"
}).appendTo('head');

// Define the local settings getters/setters
mode.settings = {
  v: {},
  load: function() {
    this.v = robopaint.utils.getSettings(mode.robopaint.name);
  },
  save: function() {
    robopaint.utils.saveSettings(this.v, mode.robopaint.name);
  },
  clear: function() {
    robopaint.utils.clearSettings(mode.robopaint.name);
  },
  $manage: function(selectors) { // Settings management on input forms
    mode.settings.load();
    $(selectors).each(function(){
      var key = this.id; // IDs required!
      var v = mode.settings.v;

      // If there's no value, check for radio buttons
      if (typeof this.value === 'undefined') {
        var $radio = $('input[type=radio]', this);

        if ($radio.length) {
          // Set loaded value (if any)
          if (typeof v[key] !== 'undefined') {
            $radio.prop('checked', false);
            $('input[value=' + v[key] + ']', this).prop('checked', true);
          }

          // Bind to catch change
          $radio.change(function(){
            if ($(this).prop('checked')) {
              mode.settings.v[key] = this.value;
              mode.settings.save();
            }
          }).change();
        } else {
          console.warn('Incompatible settings $manage element:', this);
        }
      } else { // Otherwise, use it
        // Set loaded value (if any)
        if (typeof v[key] !== 'undefined') $(this).val(v[key]);

        // Bind to catch change
        $(this).change(function(){
          mode.settings.v[key] = this.value;
          mode.settings.save();
        }).change();
      }
    });
  }
};
mode.settings.load();

// Manage loading roboPaintDependencies from mode package config
if (mode.robopaint.dependencies) {
  _.each(mode.robopaint.dependencies, function(modName){
    switch (modName) {
      case 'jquery':
        window.$ = window.jQuery = $;
        break;
      case 'underscore':
        window._ = _;
        break;
      case 'paper':
        console.log('Loading Paper');
        rpRequire('paper', preloadComplete);
        break;
      default:
        rpRequire(modName);
    }
  });
}

/**
 * Load language resources for this mode and RP common
 */
function i18nInit() {
  var res = {};
  var langCode;

  console.log('Loading languages...');

  // Iterate over language files for main RP i18n folder (gives mode access to
  // common strings).
  var fullPath = path.join(appPath, 'resources', '_i18n');
  fs.readdirSync(fullPath).forEach(function(file) {
    try {
      //  Add the data to the resource translation object
      var data = require(path.join(fullPath, file));
      langCode = data._meta.target;

      // Init empty resource language targets
      if (!res[langCode]) {
        res[langCode] = { translation: {} };
      }

      res[langCode].translation = data;
    } catch(e) {
      console.error('Bad language file:' + path.join(fullPath, file), e);
    }
  });

  // Iterate over language files in mode's i18n folder
  fullPath = path.join(mode.path.dir, '_i18n');
  fs.readdirSync(fullPath).forEach(function(file) {
    if (file.indexOf('.map.json') === -1) { // Don't use translation maps.
      try {
        //  Add the data to the resource translation object
        var data = require(path.join(fullPath, file));
        langCode = data._meta.target;

        // Init empty resource language targets
        if (!res[langCode].translation.modes) {
          res[langCode].translation.modes = {};
        }

        res[langCode].translation.modes[mode.robopaint.name] = data;
      } catch(e) {
        console.error('Bad language file:' + path.join(fullPath, file), e);
      }
    }
  });

  i18n.init({
    resStore: res,
    ns: 'translation',
    fallbackLng: 'en-US',
    lng: localStorage['robopaint-lang']
  });

  // On jQuery load trigger, run the initial translation
  $(function(){
    translateMode();
  });
}

/**
 * Translate a mode, in either native or DOM map format. Will also trigger
 * translateComplete() function on window.mode object if it exists.
 */
function translateMode() {
  i18n.setLng(localStorage['robopaint-lang']);
  // DOM Map or native parsing?
  if (mode.robopaint.i18n == 'dom') {
    var domFile = path.join(mode.path.dir, '_i18n', mode.robopaint.name + '.map.json');
    try {
      var mappings = require(domFile).map;
      for (var selector in mappings) {
        var $elements = $(selector);

        if ($elements.length === 0) {
          console.debug("TranslationDOM Map selector not found:", selector);
        }

        // When creating DOM map and i18n for non-native modes, it helps to know
        // which ones are done, and which aren't!
        var debugExtra = ""; //"XXX";

        // Replace text or specific attributes?
        var i18nKey = mappings[selector];
        if (_.isString(i18nKey)) {
          // Can't use .text() as it will replace child nodes!
          $elements.each(function(){ // Just in case we select multiple elements.
            $(this)
              .contents()
              .filter(function(){ return this.nodeType == 3; })
              .first()
              .replaceWith(robopaint.t(i18nKey) + debugExtra);
          });
        } else if (_.isObject(i18nKey)) {
          for (var attr in i18nKey) {
            $elements.each(function(){ // Just in case we select multiple elements.
              if (attr === 'text') {
                $(this)
                  .contents()
                  .filter(function(){ return this.nodeType == 3; })
                  .first()
                  .replaceWith(robopaint.t(i18nKey.text) + debugExtra);
              } else {
                $(this).attr(attr, robopaint.t(i18nKey[attr]) + debugExtra);
              }
            });
          }
        }
     }

    } catch(e) {
      console.error('Bad DOM location file:' + domFile, e);
    }
  } else { // Native i18n parsing! (much simpler)
    // Quick fix for non-reactive re-translate for modes
    $('[data-i18n=""]').each(function() {
      var $node = $(this);
      if ($node.text().indexOf('.') > -1 && $node.attr('data-i18n') == "") {
        $node.attr('data-i18n', $node.text());
      }
    });
    i18n.translateObject(window.document.body);
  }

  // If this mode implements a translateComplete callback, call it.
  if (_.isFunction(mode.translateComplete)) {
    mode.translateComplete();
  }
}

i18nInit();

// Default Inter Process Comm message management:
ipc.on('globalclose', function(){ handleModeClose('globalclose'); });
ipc.on('modechange', function(){ handleModeClose('modechange'); });
ipc.on('cncserver', function(args){ handleCNCServerMessages(args[0], args[1]); });
ipc.on('settingsUpdate', function(){ robopaint.settings = robopaint.utils.getSettings(); });

// Add a limited CNCServer API interaction layer wrapper over IPC.
mode.run = function(){
  ipc.sendToHost('cncserver-run', Array.prototype.slice.call(arguments));
};

// Add a shortcut T that doesn't require the mode prefix
mode.t = function(t,x) {
  return i18n.t('modes.' + mode.robopaint.name + '.' + t, x);
}

// Add a api for standardizing forced full cancel procedure with park.
mode.fullCancel = function(message) {
  mode.run([
    'clear',
    'resume',
    'park',
    ['status', message, true],
    ['progress', 0, 1],
    'localclear'
    // As a nice reminder, localclear MUST be last, otherwise the commands
    // after it will be cleared before being sent :P
  ], true); // As this is a forceful cancel, shove to the front of the queue
}

function handleModeClose(returnChannel) {
  // If the mode cares to make a fuss about pausing close, let it.
  if (_.isFunction(mode.onClose)) {
    mode.onClose(function(){ ipc.sendToHost(returnChannel); });
  } else { // Mode doesn't care!
    ipc.sendToHost(returnChannel);
  }
}

function handleCNCServerMessages(name, data) {
  switch(name) {
    case "penUpdate":
    case "bufferUpdate":
    case "fullyPaused":
    case "fullyResumed":
    case "callbackEvent":
      var funcName = 'on' + name.charAt(0).toUpperCase() + name.slice(1);
      if (_.isFunction(mode[funcName])) mode[funcName](data);
      break;
    case "langChange":
      translateMode();
      break;
    default:
      if (_.isFunction(mode.onMessage)) mode.onMessage(name, data);
  }
}

function preloadComplete() {
  // If we need both of these before we're ready, they both load async so
  // we need to check both before continuing to avoid race conditions.
  // This may not actually be needed, but its technically possible.
  if (mode.robopaint.dependencies && _.contains(mode.robopaint.dependencies, 'paper')) {
    if (!robopaint.canvas || !window.paper) return;
  }

  // Make sure we start with a clean slate.
  mode.run(['clear', 'resume']);

  if (_.isFunction(mode.bindControls)) mode.bindControls();
  if (_.isFunction(mode.pageInitReady)) mode.pageInitReady();
  console.log('RobPaint Mode APIs Preloaded & Ready!');
}
