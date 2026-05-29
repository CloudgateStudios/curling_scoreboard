import 'package:curling_scoreboard/l10n/app_localizations.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/material.dart';

class ConnectToClubDialog extends StatefulWidget {
  const ConnectToClubDialog({
    required this.registrationService,
    super.key,
  });

  final RegistrationService registrationService;

  @override
  State<ConnectToClubDialog> createState() => _ConnectToClubDialogState();
}

class _ConnectToClubDialogState extends State<ConnectToClubDialog> {
  final _controller = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _connect(AppLocalizations l10n) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await widget.registrationService.connectWithPairingCode(
        _controller.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on PairingCodeNotFoundException {
      if (mounted) {
        setState(() {
          _errorMessage = l10n.connectToClubDialogErrorNotFound;
          _isLoading = false;
        });
      }
    } on Exception catch (e) {
      debugPrint('Club connection error: $e');
      if (mounted) {
        setState(() {
          _errorMessage = l10n.connectToClubDialogErrorGeneric;
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(l10n.connectToClubDialogTitle),
      content: TextField(
        controller: _controller,
        enabled: !_isLoading,
        textCapitalization: TextCapitalization.characters,
        decoration: InputDecoration(
          labelText: l10n.connectToClubDialogPairingCodeLabel,
          hintText: l10n.connectToClubDialogPairingCodeHint,
          errorText: _errorMessage,
          errorMaxLines: 3,
        ),
        onSubmitted: (_) => _connect(l10n),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.connectToClubDialogCancelButton),
        ),
        TextButton(
          onPressed: _isLoading ? null : () => _connect(l10n),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.connectToClubDialogConnectButton),
        ),
      ],
    );
  }
}
