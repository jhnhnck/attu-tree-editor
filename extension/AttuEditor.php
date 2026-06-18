<?php
/**
 * AttuEditor - mediawiki extension entry point
 * licensed under the MIT license; see LICENSE.md for full text
 */

if ( !defined( 'MEDIAWIKI' ) ) {
    die( 'Not an entry point.' );
}

// extension.json handles all registration via mediawiki's extension mechanism.
// this file is the legacy entry point kept for compatibility; new installs
// use wfLoadExtension( 'AttuEditor' ) in LocalSettings.php instead.
