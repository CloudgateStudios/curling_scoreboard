import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/connection/disconnect_dialog.dart';
import 'package:flutter/material.dart';

/// The club and sheet a connected scoreboard is paired with, and the way to
/// disconnect it. Pops with true when the scoreboard was disconnected.
class ConnectionDialog extends StatelessWidget {
  const ConnectionDialog({required this.registrationService, super.key});

  final RegistrationService registrationService;

  Future<void> _disconnect(BuildContext context) async {
    final disconnected = await showDialog<bool>(
      context: context,
      builder: (_) =>
          DisconnectDialog(registrationService: registrationService),
    );
    if ((disconnected ?? false) && context.mounted) {
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reg = registrationService;

    return AlertDialog(
      title: Text(l10n.connectionDialogTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.connectionDialogClub(reg.clubName ?? '')),
          Text(l10n.connectionDialogSheet(reg.sheetName ?? '')),
          ValueListenableBuilder<bool>(
            valueListenable: reg.pairingLost,
            builder: (context, pairingLost, _) {
              if (!pairingLost) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  l10n.connectionDialogPairingLost,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              );
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => _disconnect(context),
          style: TextButton.styleFrom(
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          child: Text(l10n.connectionDialogDisconnectButton),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.connectionDialogCloseButton),
        ),
      ],
    );
  }
}
