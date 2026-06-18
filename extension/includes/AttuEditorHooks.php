<?php
/**
 * AttuEditor - hook handlers
 * licensed under the MIT license; see LICENSE.md for full text
 */

class AttuEditorHooks {

    /**
     * Registers the editor preference in Special:Preferences.
     */
    public static function onGetPreferences( User $user, array &$preferences ): void {
        $preferences['attueditor-editor'] = [
            'type' => 'toggle',
            'label-message' => 'attueditor-pref-label',
            'section' => 'editing/editor',
        ];
    }

    /**
     * Replaces the edit textarea with the attu editor mount point when the
     * user has the preference enabled.
     */
    public static function onEditFormInitial( EditPage $editPage, OutputPage $out ): void {
        $user = $out->getUser();
        if ( !$user->getOption( 'attueditor-editor' ) ) {
            return;
        }

        $out->addModules( 'ext.attuEditor' );
        $out->addHTML( '<div id="attu-editor" data-title="' .
            htmlspecialchars( $editPage->getTitle()->getPrefixedText() ) .
            '"></div>' );
    }
}
