import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en')];

  /// The text used for a team using Red rocks.
  ///
  /// In en, this message translates to:
  /// **'Red'**
  String get teamNameRed;

  /// The text used for a team using Yellow rocks.
  ///
  /// In en, this message translates to:
  /// **'Yellow '**
  String get teamNameYellow;

  /// Generic button text for a yes/affirm action.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get buttonLabelYes;

  /// Generic button text for a no/disallow action.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get buttonLabelNo;

  /// No description provided for @appBarAddScoreButtonLabel.
  ///
  /// In en, this message translates to:
  /// **'Add Score'**
  String get appBarAddScoreButtonLabel;

  /// No description provided for @appBarFinishGameButtonLabel.
  ///
  /// In en, this message translates to:
  /// **'Finish Game'**
  String get appBarFinishGameButtonLabel;

  /// Title of the dialog shown to setup the game.
  ///
  /// In en, this message translates to:
  /// **'Game Setup'**
  String get gameStartDialogTitle;

  /// Description text for the number of ends setting in the game start dialog.
  ///
  /// In en, this message translates to:
  /// **'Number of Ends:'**
  String get gameStartDialogFormLabelNumberOfEnds;

  /// Description text for the number of players setting in the game start dialog.
  ///
  /// In en, this message translates to:
  /// **'Players per Team:'**
  String get gameStartDialogFormLabelPlayersPerTeam;

  /// Button label for how long each end is when setting up a game.
  ///
  /// In en, this message translates to:
  /// **'{minutesPerEnd} min per end \r\n{gameTotalTime} total'**
  String gameStartDialogTimePerEndByPlayersButtonLabel(
    String minutesPerEnd,
    String gameTotalTime,
  );

  /// Button label for no players essentially turning the game clock display off. Game time will still be counted in background.
  ///
  /// In en, this message translates to:
  /// **'Turn off Game Clock'**
  String get gameStartDialogZeroPlayersButtonLabel;

  /// Description text for the 1st end hammer setting in the game start dialog.
  ///
  /// In en, this message translates to:
  /// **'1st End Hammer:'**
  String get gameStartDialogFormLabelFirstEndHammer;

  /// Button label to start the game.
  ///
  /// In en, this message translates to:
  /// **'Start Game'**
  String get gameStartDialogButtonLabelStartGame;

  /// No description provided for @finishGameConfirmationDialogDescription.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to finish the game?'**
  String get finishGameConfirmationDialogDescription;

  /// Title of the dialog shown at the end of a game.
  ///
  /// In en, this message translates to:
  /// **'Game Report'**
  String get gameEndDialogTitle;

  /// Text label for the game end report table column listing the time taken for the end.
  ///
  /// In en, this message translates to:
  /// **'End'**
  String get gameEndDialogEndTableHeader;

  /// No description provided for @gameEndDialogEndTimeTableHeader.
  ///
  /// In en, this message translates to:
  /// **'End Time'**
  String get gameEndDialogEndTimeTableHeader;

  /// No description provided for @gameEndDialogGameTimeTableHeader.
  ///
  /// In en, this message translates to:
  /// **'Game Time'**
  String get gameEndDialogGameTimeTableHeader;

  /// No description provided for @gameEndDialogTotalsTableHeader.
  ///
  /// In en, this message translates to:
  /// **'Totals'**
  String get gameEndDialogTotalsTableHeader;

  /// Button label to dismiss the end game dialog
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get gameEndDialogButtonLabelDismiss;

  /// Title text for the edit score dialog.
  ///
  /// In en, this message translates to:
  /// **'Score - End {endNumberName}'**
  String scoreInputDialogTitle(String endNumberName);

  /// Button text for score input dialog to submit the score.
  ///
  /// In en, this message translates to:
  /// **'Enter'**
  String get scoreInputEnterButtonLabel;

  /// Message shown to the user when they try and enter a score for a game that has been completed.
  ///
  /// In en, this message translates to:
  /// **'Game is complete. Finish the game to reset.'**
  String get addScoreGameCompleteMessage;

  /// Text for the game info section to show the current game time
  ///
  /// In en, this message translates to:
  /// **'Game Time {gameTimeString}'**
  String gameInfoGameTimeLabel(String gameTimeString);

  /// Label for the scoreboard for the extra end
  ///
  /// In en, this message translates to:
  /// **'E'**
  String get scoreboardExtraEndLabel;

  /// Title of the settings dialog.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsDialogTitle;

  /// Label for the scoreboard style setting.
  ///
  /// In en, this message translates to:
  /// **'Scoreboard Style'**
  String get settingsDialogLabelScoreboardStyle;

  /// Label for the Baseball scoreboard style.
  ///
  /// In en, this message translates to:
  /// **'Baseball'**
  String get settingsDialogScoreboardStyleBaseball;

  /// Label for the Curling Club scoreboard style.
  ///
  /// In en, this message translates to:
  /// **'Curling Club'**
  String get settingsDialogScoreboardStyleCurlingClub;

  /// Button label to close the settings dialog.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get settingsDialogButtonLabelClose;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
