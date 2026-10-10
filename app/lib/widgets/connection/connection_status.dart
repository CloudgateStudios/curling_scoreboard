import 'dart:async';

import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/widgets/connection/connect_to_club_dialog.dart';
import 'package:curling_scoreboard/widgets/connection/connection_dialog.dart';
import 'package:flutter/material.dart';

/// The scoreboard's club connection, as the game setup screen shows it.
///
/// An unconnected scoreboard offers a button to connect. A connected one
/// only says where it is connected: the dialog that can disconnect it opens
/// after the text is pressed and held, so it is not found by tapping around.
class ConnectionStatus extends StatefulWidget {
  const ConnectionStatus({
    required this.registrationService,
    this.onChanged,
    super.key,
  });

  final RegistrationService registrationService;

  /// Called after the scoreboard connects to a club or disconnects from one.
  final VoidCallback? onChanged;

  /// How long the connection has to be held to open its dialog.
  static const holdDuration = Duration(seconds: 4);

  @override
  State<ConnectionStatus> createState() => _ConnectionStatusState();
}

class _ConnectionStatusState extends State<ConnectionStatus>
    with SingleTickerProviderStateMixin {
  late final AnimationController _hold =
      AnimationController(vsync: this, duration: ConnectionStatus.holdDuration)
        ..addStatusListener((status) {
          if (status == AnimationStatus.completed) {
            _hold.reset();
            unawaited(_openConnectionDialog());
          }
        });

  @override
  void dispose() {
    _hold.dispose();
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
    widget.onChanged?.call();
  }

  Future<void> _connect() async {
    final connected = await showDialog<bool>(
      context: context,
      builder: (_) =>
          ConnectToClubDialog(registrationService: widget.registrationService),
    );
    if (connected ?? false) _changed();
  }

  Future<void> _openConnectionDialog() async {
    final disconnected = await showDialog<bool>(
      context: context,
      builder: (_) =>
          ConnectionDialog(registrationService: widget.registrationService),
    );
    if (disconnected ?? false) _changed();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reg = widget.registrationService;

    if (!reg.isRegistered) {
      return OutlinedButton.icon(
        onPressed: _connect,
        icon: const Icon(Icons.link, size: 28),
        label: Text(
          l10n.connectionButtonLabel,
          style: const TextStyle(fontSize: 24),
        ),
      );
    }

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _hold.forward(from: 0),
      onTapUp: (_) => _hold.reset(),
      onTapCancel: _hold.reset,
      child: ValueListenableBuilder<bool>(
        valueListenable: reg.pairingLost,
        builder: (context, pairingLost, _) {
          final color = pairingLost
              ? Theme.of(context).colorScheme.error
              : Colors.grey.shade700;
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox.square(
                dimension: 28,
                // The ring fills in while the text is held.
                child: AnimatedBuilder(
                  animation: _hold,
                  builder: (context, _) => _hold.isAnimating
                      ? CircularProgressIndicator(
                          value: _hold.value,
                          strokeWidth: 3,
                        )
                      : Icon(
                          pairingLost ? Icons.link_off : Icons.link,
                          color: color,
                          size: 28,
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.connectionConnectedAs(
                        reg.clubName ?? '',
                        reg.sheetName ?? '',
                      ),
                      style: TextStyle(fontSize: 24, color: color),
                    ),
                    if (pairingLost)
                      Text(
                        l10n.connectionNotSyncing,
                        style: TextStyle(fontSize: 18, color: color),
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
