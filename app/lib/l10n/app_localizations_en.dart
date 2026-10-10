// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get teamNameRed => 'Red';

  @override
  String get teamNameYellow => 'Yellow';

  @override
  String get buttonLabelYes => 'Yes';

  @override
  String get buttonLabelNo => 'No';

  @override
  String get appBarAddScoreButtonLabel => 'Add Score';

  @override
  String get appBarFinishGameButtonLabel => 'Finish Game';

  @override
  String get gameStartDialogLeagueBarLeagueLabel => 'League';

  @override
  String get gameStartDialogLeagueBarChooseLeague => 'Choose league';

  @override
  String get leaguePlayingNowLabel => 'Playing now';

  @override
  String get leagueChooserTitle => 'Which league?';

  @override
  String get gameStartDialogLeagueBarPickTeams => 'Pick teams';

  @override
  String get gameStartDialogLeagueBarClearTooltip => 'Clear teams';

  @override
  String get matchupVersus => 'vs';

  @override
  String get matchupPickerEmptySlotLabel => 'Tap a team';

  @override
  String get matchupPickerSwapTooltip => 'Swap colors';

  @override
  String get matchupPickerCancelButtonLabel => 'Cancel';

  @override
  String get matchupPickerDoneButtonLabel => 'Done';

  @override
  String get gameStartDialogFormLabelNumberOfEnds => 'Number of Ends:';

  @override
  String get gameStartDialogFormLabelPlayersPerTeam => 'Players per Team:';

  @override
  String gameStartDialogTimePerEndByPlayersButtonLabel(
    String minutesPerEnd,
    String gameTotalTime,
  ) {
    return '$minutesPerEnd min per end \r\n$gameTotalTime total';
  }

  @override
  String get gameStartDialogZeroPlayersButtonLabel => 'Turn off Game Clock';

  @override
  String get gameStartDialogFormLabelFirstEndHammer => '1st End Hammer:';

  @override
  String get gameStartDialogButtonLabelStartGame => 'Start Game';

  @override
  String get finishGameConfirmationDialogDescription =>
      'Are you sure you want to finish the game?';

  @override
  String get gameEndDialogTitle => 'Game Report';

  @override
  String get gameEndDialogEndTableHeader => 'End';

  @override
  String get gameEndDialogEndTimeTableHeader => 'End Time';

  @override
  String get gameEndDialogGameTimeTableHeader => 'Game Time';

  @override
  String get gameEndDialogButtonLabelDismiss => 'Dismiss';

  @override
  String scoreInputDialogTitle(String endNumberName) {
    return 'Score - End $endNumberName';
  }

  @override
  String get scoreInputEnterButtonLabel => 'Enter';

  @override
  String get addScoreGameCompleteMessage =>
      'Game is complete. Finish the game to reset.';

  @override
  String gameInfoGameTimeLabel(String gameTimeString) {
    return 'Game Time $gameTimeString';
  }

  @override
  String get scoreboardExtraEndLabel => 'E';

  @override
  String get settingsDialogTitle => 'Settings';

  @override
  String get settingsDialogLabelScoreboardStyle => 'Scoreboard Style';

  @override
  String get settingsDialogScoreboardStyleBaseball => 'Baseball';

  @override
  String get settingsDialogScoreboardStyleCurlingClub => 'Curling Club';

  @override
  String get settingsDialogButtonLabelClose => 'Close';

  @override
  String get connectionButtonLabel => 'Connection';

  @override
  String connectionConnectedAs(String clubName, String sheetName) {
    return 'Connected as $clubName – $sheetName';
  }

  @override
  String get connectionNotSyncing =>
      'Scores are not syncing. Press and hold to fix.';

  @override
  String get connectionDialogTitle => 'Club Connection';

  @override
  String connectionDialogClub(String clubName) {
    return 'Club: $clubName';
  }

  @override
  String connectionDialogSheet(String sheetName) {
    return 'Sheet: $sheetName';
  }

  @override
  String get connectionDialogPairingLost =>
      'Disconnected. This scoreboard is no longer paired with this sheet, so scores are not being sent. Disconnect, then connect again with a new pairing code.';

  @override
  String get connectionDialogDisconnectButton => 'Disconnect';

  @override
  String get connectionDialogCloseButton => 'Close';

  @override
  String get connectToClubDialogTitle => 'Connect to Club';

  @override
  String get connectToClubDialogPairingCodeLabel => 'Pairing Code';

  @override
  String get connectToClubDialogPairingCodeHint =>
      'Enter code from your club admin';

  @override
  String get connectToClubDialogConnectButton => 'Connect';

  @override
  String get connectToClubDialogCancelButton => 'Cancel';

  @override
  String get connectToClubDialogErrorNotFound =>
      'Pairing code not found. Please check the code and try again.';

  @override
  String get connectToClubDialogErrorGeneric =>
      'Connection failed. Please try again.';

  @override
  String get disconnectDialogTitle => 'Disconnect Sheet';

  @override
  String disconnectDialogContent(String clubName) {
    return 'This will stop syncing scores to $clubName. Enter the club\'s admin PIN to disconnect.';
  }

  @override
  String get disconnectDialogPinLabel => 'Admin PIN';

  @override
  String get disconnectDialogErrorIncorrectPin =>
      'Incorrect PIN. Please try again.';

  @override
  String disconnectDialogErrorNoPin(String clubName) {
    return '$clubName has no admin PIN yet. A club admin can set one in the admin portal.';
  }

  @override
  String get disconnectDialogErrorGeneric =>
      'Could not disconnect. Check the internet connection and try again.';

  @override
  String get disconnectDialogCancelButton => 'Cancel';

  @override
  String get disconnectDialogDisconnectButton => 'Disconnect';

  @override
  String updateCountdownMessage(int seconds) {
    return 'Updating to the latest version in $seconds seconds. Tap anywhere to wait.';
  }
}
