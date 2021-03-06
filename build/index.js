var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var mkdirp = require('mkdirp');
var fsExtra = require('fs.extra');
var rimraf = require('rimraf');

var readFileAsync = Promise.promisify(fs.readFile, fs);
var writeFileAsync = Promise.promisify(fs.writeFile, fs);

var copyFolderAsync = Promise.promisify(fsExtra.copyRecursive, fsExtra);
var rimrafAsync = Promise.promisify(rimraf, rimraf);


var XSL_KEYS_MARKER = '<!--*****SUPERSONIC_XSL_KEYS*****-->';
var XSL_TEMPLATES_MARKER = '<!--*****SUPERSONIC_XSL_TEMPLATES*****-->';
var XML_APPLICATION_MARKER = '<!--*****SUPERSONIC_PLUGINS_APPLICATION*****-->';
var XML_MANIFEST_MARKER = '<!--*****SUPERSONIC_PLUGINS_MANIFEST*****-->';
var XML_GRADLE_TEALEAF_MARKER = '//<!--*****SUPERSONIC_PLUGINS_DEPENDENCIES*****-->';

/**
 * Supersonic.build#onBeforeBuild
 *
 * Creates the android/ios folder at build time by reading the manifest
 * for enabled plugins and building the correct files.
 *
 */
exports.onBeforeBuild = function (api, app, config, cb) {

  // for each provider
  //  -  merge config.json
  //  -  merge manifest.xml files -- xmlActivity.xml, xmlApplication.xml, xmlManifest.xml
  //  -  merge manifest.xsl files -- xslKeys.xsl, xslTemplates.xsl
  //  -  copy everything in files to the platform folder

  var err = null,
    providers = [],
    infoPromises = [],
    configPromises = [],
    copyPaths = {},
    xslKeyPromises = [],
    xslTemplatePromises = [],
    xmlApplicationPromises = [],
    xmlManifestPromises = [],
    xmlGradleClasspathPromises = [],
    xmlGradleTealeafPromises = [],
    xmlGradleProguardPromises = [],
    folder, xslKeys, xslTemplate, xmlApplication, xmlManifest, xmlGradleClasspath, xmlGradleTealeaf, xmlProguard,
    configPromise, xslPromise, baseXslPath, xslPromise, baseXmlPath, xmlPromise,
    xmlClasspathPromise, xmlProguardPromise, xmlTealeafPromise,  baseXmlTealeafPath,
    baseXmlProguard,baseXmlClasspathPath,
    platformPath, provider, dirname, configFile, i;

  // read manifest for which providers are enabled
  if (config.target === 'native-android') {
    if (!app.manifest.addons ||
      !app.manifest.addons.ironsource ||
      !app.manifest.addons.ironsource.android ||
      !app.manifest.addons.ironsource.android.providers) {
      console.warn('{ironsource} No providers found -- looked in manifest.addons.ironsource.android.providers');
    } else {
      providers = app.manifest.addons.ironsource.android.providers;
    }
    folder = 'android';
  } else {
    if (!app.manifest.addons ||
      !app.manifest.addons.ironsource ||
      !app.manifest.addons.ironsource.ios ||
      !app.manifest.addons.ironsource.ios.providers) {
      console.warn('{ironsource} No providers found -- looked in manifest.addons.ironsource.ios.providers');
    } else {
      providers = app.manifest.addons.ironsource.ios.providers;
    }
    folder = 'ios';
  }

  // always include ironsource
  providers.push('ironsource');

  // read provider config and copy any necessary files
  for (i = 0; i < providers.length; i++) {

    provider = providers[i];
    console.log("{ironsource} Adding provider", provider);
    dirname = path.join(__dirname, 'providers', provider, folder);

    // read provider config.json
    configFile = path.join(dirname, 'config.json');
    configPromises.push(
      readFileAsync(configFile, 'utf8').then(function (contents) {
        return JSON.parse(contents);
      })
    );

    // copy all the files in 'files'
    if (fs.existsSync(path.join(dirname, 'files'))) {
      copyPaths[path.join(dirname, 'files')] = path.join(__dirname, '..', folder);
    }

    if (config.target === 'native-android') {
      // read provider manifest.xsl changes
      xslKeys = path.join(dirname, 'xslKeys.xsl');
      xslKeyPromises.push(
        readFileAsync(xslKeys, 'utf8')
      );
      xslTemplate = path.join(dirname, 'xslTemplates.xsl');
      xslTemplatePromises.push(
        readFileAsync(xslTemplate, 'utf8')
      );

      // read provider manifest.xml changes
      xmlApplication = path.join(dirname, 'xmlApplication.xml');
      xmlApplicationPromises.push(
        readFileAsync(xmlApplication, 'utf8')
      );
      xmlManifest = path.join(dirname, 'xmlManifest.xml');
      xmlManifestPromises.push(
        readFileAsync(xmlManifest, 'utf8')
      );

      xmlGradleTealeaf = path.join(dirname, 'gradletealeaf.xml');
      if(fs.existsSync(xmlGradleTealeaf)) {
        xmlGradleTealeafPromises.push(
          readFileAsync(xmlGradleTealeaf, 'utf8')
        );
      }


        xmlGradleClasspath = path.join(dirname, 'gradleclasspath.xml');
      if(fs.existsSync(xmlGradleClasspath)) {
        xmlGradleClasspathPromises.push(
          readFileAsync(xmlGradleClasspath, 'utf8')
        );
      }


        xmlProguard = path.join(dirname, 'proguard.xml');
      if(fs.existsSync(xmlProguard)) {
        xmlGradleProguardPromises.push(
          readFileAsync(xmlProguard, 'utf8')
        );
      }

    }
  }

  // merge all the configs together
  configPromise = processConfig(configPromises);

  // combine xsl
  if (config.target === 'native-android') {
    baseXslPath = path.join(__dirname, folder, 'manifest.xsl');
    xslPromise = processXsl(baseXslPath, xslKeyPromises, xslTemplatePromises);

    // combine xml
    baseXmlPath = path.join(__dirname, folder, 'manifest.xml');
    xmlPromise = processXml(
      baseXmlPath,
      //xmlActivityPromises,
      xmlApplicationPromises,
      xmlManifestPromises
    );

    baseXmlTealeafPath = path.join(__dirname, folder, 'gradletealeaf.xml');
    xmlTealeafPromise = processGradleXml(
      baseXmlTealeafPath,
      xmlGradleTealeafPromises,
      XML_GRADLE_TEALEAF_MARKER
    );

    baseXmlClasspathPath = path.join(__dirname, folder, 'gradleclasspath.xml');
    xmlClasspathPromise = processGradleXml(
      baseXmlClasspathPath,
      xmlGradleClasspathPromises,
      XML_GRADLE_TEALEAF_MARKER
    );

    baseXmlProguard = path.join(__dirname, folder, 'proguard.xml');
    xmlProguardPromise = processGradleXml(
      baseXmlProguard,
      xmlGradleProguardPromises,
      XML_GRADLE_TEALEAF_MARKER
    );
  }

  // path to plugin platform folder (eg: ironsource/android)
  platformPath = path.join(__dirname, '..', folder);

  // remove the target folder in the plugin and recreate with correct content
  rimrafAsync(platformPath).then(function () {
    mkdirp(platformPath);
  }).then(function () {
    mkdirp(path.join(platformPath, 'src'));
  }).then(function () {

    var copyPromises = [];
    var srcPaths = Object.keys(copyPaths);
    for (var i = 0; i < srcPaths.length; i++) {
      copyPromises.push(
      copyFolderAsync(
        srcPaths[i],
        copyPaths[srcPaths[i]]
        )
      )
    }

    return Promise.all([
      configPromise, xslPromise, xmlPromise, xmlTealeafPromise, xmlClasspathPromise, xmlProguardPromise, Promise.all(copyPromises)
    ]);
  }).spread(function (finalConfig, finalXsl, finalXml, finalTealeaf, finalClasspath, finalProguard) {



    var writePromises = [
      // write config.json
      writeFileAsync(
        path.join(platformPath, 'config.json'),
        JSON.stringify(finalConfig),
        {encoding: 'utf8'}
      )
    ];

    if (config.target === 'native-android') {
      // write manifest.xml
      writePromises.push(
        writeFileAsync(
          path.join(platformPath, 'manifest.xml'),
          finalXml,
          {encoding: 'utf8'}
        )
      );

      // write manifest.xsl
      writePromises.push(
        writeFileAsync(
          path.join(platformPath, 'manifest.xsl'),
          finalXsl,
          {encoding: 'utf8'}
        )
      );

      // write gradletealeaf.xml
      writePromises.push(
        writeFileAsync(
          path.join(platformPath, 'gradletealeaf.xml'),
          finalTealeaf,
          {encoding: 'utf8'}
        )
      );

      // write gradleclasspath.xml
      writePromises.push(
        writeFileAsync(
          path.join(platformPath, 'gradleclasspath.xml'),
          finalClasspath,
          {encoding: 'utf8'}
        )
      );

      // write proguard.xml
      writePromises.push(
        writeFileAsync(
          path.join(platformPath, 'proguard.xml'),
          finalProguard,
          {encoding: 'utf8'}
        )
      );
    }

    return Promise.all(writePromises);
  }).spread(function () {
    console.log("{ironsource} Finished setting up providers");
    cb();
  });
}


/**
 * Accepts a list of promises with the content of config files
 * then merges them all together and returns the final config.
 */
function processConfig(configPromises) {
  return Promise.reduce(
    configPromises,
    function (baseConfig, providerConfig) {
      mergeConfig(baseConfig, providerConfig);
      return baseConfig;
    },
    {}
  );
}


/**
 * Accepts a path to the base xml file and lists of promises with the contents
 * of plugin xslKey and xslTemplate sections.
 * Reads the given baseXsl and injects the concatenated plugin content
 * into the baseXsl, returning the final xsl.
 */
function processXsl(baseXslPath, xslKeyPromises, xslTemplatePromises) {
  var xslKeyPromise = concatContent(xslKeyPromises);
  var xslTemplatePromise = concatContent(xslTemplatePromises);

  return Promise.all([
    readFileAsync(baseXslPath, 'utf8'),
    xslKeyPromise,
    xslTemplatePromise
  ]).spread(function (baseXsl, xslKeys, xslTemplates) {
    // inject templates
    baseXsl = injectContent(baseXsl, XSL_KEYS_MARKER, xslKeys);
    baseXsl = injectContent(baseXsl, XSL_TEMPLATES_MARKER, xslTemplates);

    return baseXsl;
  });
}

/**
 * Accepts a path to the base xml file and lists of promises with the contents
 * of plugin xmlApplication, xmlActivity, and xmlManifest files.
 * Reads the given baseXml and injects the concatenated plugin content
 * into the baseXml, returning the final xml.
 */
function processXml(baseXmlPath, xmlApplicationPromises, xmlManifestPromises) {
  var xmlApplicationPromise = concatContent(xmlApplicationPromises);
  var xmlManifestPromise = concatContent(xmlManifestPromises);

  return Promise.all([
    readFileAsync(baseXmlPath, 'utf8'),
    xmlApplicationPromise,
    xmlManifestPromise
  ]).spread(function (baseXml, xmlApplication, xmlManifest) {
    // inject templates
    baseXml = injectContent(baseXml, XML_APPLICATION_MARKER, xmlApplication);
    baseXml = injectContent(baseXml, XML_MANIFEST_MARKER, xmlManifest);

    return baseXml;
  });
}

function processGradleXml(baseXmlPath, xmlPromises, XML_MARKER) {
  var xmlPromise = concatContent(xmlPromises);

  return Promise.all([
    readFileAsync(baseXmlPath, 'utf8'),
    xmlPromise
  ]).spread(function (baseXml, xmlPromise) {
    baseXml = injectContent(baseXml, XML_MARKER, xmlPromise);

    return baseXml;
  });
}

/**
 * Accepts a string, a marker, and content and returns the string
 * with the marker replaced with the content.
 */
function injectContent(content, marker, newContent) {
  var index = content.indexOf(marker);
  if (index > -1) {
    content = content.slice(0, index) +
      newContent +
      content.slice(index + marker.length);
  }
  return content;
}

/**
 * Accepts a list of promises that return some file content and
 * concatenates them all together, returning a promise with the
 * final, concatenated content.
 */

function concatContent(promises) {
  return Promise.reduce(
    promises,
    function (baseContent, providerContent) {
      baseContent += providerContent;
      return baseContent;
    },
    ''
  );
}

/**
 * Merges config. Expects the newConfig form to match existing config form.
 * Does not do error checking - only use this when you have control of both
 * inputs.
 */
var mergeConfig = function (config, newConfig) {
  var keys = Object.keys(newConfig);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];

    // if key already exists
    if (key in config) {
      // value is an array, merge array (assumes both are arrays)
      if (Array.isArray(config[key])) {
        for (var j = 0; j < newConfig[key].length; j++) {
          var val = newConfig[key][j];
          if (config[key].indexOf(val) === -1) {
            config[key].push(val);
          }
        }
      } else if (typeof config[key] === 'object') {
        // value is an object, recurse
        mergeConfig(config[key], newConfig[key]);
      } else {
        // warn about overwriting keys
        console.warn(
          "{ironsource} Warning - onBeforeBuild config overwrote existing key",
          key
        );
        config[key] = newConfig[key];
      }
    } else {
      config[key] = newConfig[key];
    }
  }
};