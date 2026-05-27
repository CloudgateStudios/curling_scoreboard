import 'package:flutter/material.dart';

class AppBarActionButton extends StatelessWidget {
  const AppBarActionButton({
    required this.icon,
    required this.onPressed,
    this.label = '',
    this.padding = const EdgeInsets.only(right: 10),
    super.key,
  });

  final IconData icon;
  final String label;
  final void Function() onPressed;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: ElevatedButton(
        onPressed: onPressed,
        child: label.isEmpty ? iconOnly() : iconAndText(),
      ),
    );
  }

  Widget iconAndText() {
    return Row(
      children: [
        Icon(icon),
        const SizedBox(width: 10),
        FittedBox(
          child: Text(
            label,
            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }

  Widget iconOnly() {
    return Icon(icon, size: 30);
  }
}
