import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:flutter/material.dart';

class FinishGameDialog extends StatelessWidget {
  const FinishGameDialog({required this.finishGameAction, super.key});

  final void Function(BuildContext) finishGameAction;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      content: Text(
        context.l10n.finishGameConfirmationDialogDescription,
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
            context.l10n.buttonLabelYes,
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
          ),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.of(context).pop();
          },
          child: Text(
            context.l10n.buttonLabelNo,
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}
