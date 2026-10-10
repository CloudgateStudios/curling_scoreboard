import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Asks for the club's admin PIN and disconnects the scoreboard once it is
/// accepted. Pops with true when the scoreboard was disconnected.
class DisconnectDialog extends StatefulWidget {
  const DisconnectDialog({required this.registrationService, super.key});

  final RegistrationService registrationService;

  @override
  State<DisconnectDialog> createState() => _DisconnectDialogState();
}

class _DisconnectDialogState extends State<DisconnectDialog> {
  final _controller = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _disconnect(AppLocalizations l10n) async {
    final clubName = widget.registrationService.clubName ?? '';
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    String? error;
    try {
      await widget.registrationService.disconnect(pin: _controller.text);
      if (mounted) Navigator.of(context).pop(true);
      return;
    } on IncorrectAdminPinException {
      error = l10n.disconnectDialogErrorIncorrectPin;
    } on AdminPinNotSetException {
      error = l10n.disconnectDialogErrorNoPin(clubName);
    } on Exception catch (e) {
      debugPrint('Club disconnection error: $e');
      error = l10n.disconnectDialogErrorGeneric;
    }

    if (mounted) {
      _controller.clear();
      setState(() {
        _errorMessage = error;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AlertDialog(
      title: Text(l10n.disconnectDialogTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.disconnectDialogContent(
              widget.registrationService.clubName ?? '',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            enabled: !_isLoading,
            autofocus: true,
            obscureText: true,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(8),
            ],
            decoration: InputDecoration(
              labelText: l10n.disconnectDialogPinLabel,
              errorText: _errorMessage,
              errorMaxLines: 3,
            ),
            onSubmitted: (_) => _disconnect(l10n),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.disconnectDialogCancelButton),
        ),
        TextButton(
          onPressed: _isLoading ? null : () => _disconnect(l10n),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.disconnectDialogDisconnectButton),
        ),
      ],
    );
  }
}
