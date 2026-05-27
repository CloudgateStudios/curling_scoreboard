import 'package:curling_scoreboard_flutter/l10n/app_localizations.dart';
import 'package:flutter/material.dart';

class FinishGameDialog extends StatelessWidget {
  const FinishGameDialog({required this.finishGameAction, super.key});

  final void Function(BuildContext) finishGameAction;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      content: Text(
        AppLocalizations.of(context)!.finishGameConfirmationDialogDescription,
        style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
      ),
      contentPadding: const EdgeInsets.all(50),
      actionsAlignment: MainAxisAlignment.center,
      buttonPadding: const EdgeInsets.all(200),
      actions: [
        ElevatedButton(
          onPressed: () {
            Navigator.of(context).pop();
            finishGameAction(context);
          },
          child: Text(
            AppLocalizations.of(context)!.buttonLabelYes,
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
          ),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.of(context).pop();
          },
          child: Text(
            AppLocalizations.of(context)!.buttonLabelNo,
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}
