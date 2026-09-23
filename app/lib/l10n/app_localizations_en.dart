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
  String get gameStartDialogTitle => 'Game Setup';

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
  String get gameEndDialogTotalsTableHeader => 'Totals';

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
  String get settingsDialogConnectionSectionTitle => 'Club Connection';

  @override
  String get settingsDialogConnectButtonLabel => 'Connect to Club';

  @override
  String settingsDialogConnectedClub(String clubName) {
    return 'Club: $clubName';
  }

  @override
  String settingsDialogConnectedSheet(String sheetName) {
    return 'Sheet: $sheetName';
  }

  @override
  String get settingsDialogDisconnectButtonLabel => 'Disconnect';

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
  String get disconnectConfirmationTitle => 'Disconnect Sheet';

  @override
  String disconnectConfirmationContent(String clubName) {
    return 'This will stop syncing scores to $clubName. Local scoring will continue.';
  }

  @override
  String get disconnectConfirmationButton => 'Disconnect';
}
