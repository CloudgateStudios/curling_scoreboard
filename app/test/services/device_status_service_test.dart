import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/services/device_status_service.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:curling_scoreboard/services/update_service.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DeviceStatusService', () {
    late List<Map<String, dynamic>> written;
    late DateTime now;

    DeviceStatusService service({
      String buildId = 'build-1',
      UpdateService? updateService,
      SyncError? Function()? lastSyncError,
    }) => DeviceStatusService(
      write: (status) async => written.add(status),
      updateService: updateService,
      lastSyncError: lastSyncError,
      buildId: buildId,
      userAgent: () => 'TestBrowser/1.0',
      clock: () => now,
    );

    setUp(() {
      written = [];
      now = DateTime(2026, 10, 8, 19, 30);
    });

    test('reports the app version and build', () {
      final status = service().buildStatus();

      expect(status['appVersion'], packageVersion);
      expect(status['buildId'], 'build-1');
      expect(status['userAgent'], 'TestBrowser/1.0');
      expect(status['clientTime'], now);
      expect(status['utcOffsetMinutes'], now.timeZoneOffset.inMinutes);
      expect(status['screen'], containsPair('pixelRatio', isA<double>()));
    });

    test('leaves out what does not apply', () {
      final status = service(buildId: '').buildStatus();

      expect(status.containsKey('buildId'), isFalse);
      expect(status.containsKey('updateTargetBuildId'), isFalse);
      expect(status.containsKey('lastReloadAttemptAt'), isFalse);
      expect(status.containsKey('lastSyncError'), isFalse);
    });

    test('includes the last failed sync', () {
      final failedAt = DateTime(2026, 10, 8, 19);
      final status = service(
        lastSyncError: () =>
            (operation: 'pushLiveGame', message: 'unavailable', at: failedAt),
      ).buildStatus();

      expect(status['lastSyncError'], {
        'operation': 'pushLiveGame',
        'message': 'unavailable',
        'at': failedAt,
      });
    });

    test('reports on start and then on every heartbeat', () {
      fakeAsync((async) {
        final s = service()..start();
        async.flushMicrotasks();
        expect(written, hasLength(1));

        async.elapse(Constants.deviceStatusHeartbeat * 2);
        expect(written, hasLength(3));

        s.dispose();
        async.elapse(Constants.deviceStatusHeartbeat);
        expect(written, hasLength(3));
      });
    });

    test('keeps the session start across reports', () {
      fakeAsync((async) {
        final started = now;
        final s = service()..start();
        now = now.add(const Duration(hours: 1));
        async.elapse(Constants.deviceStatusHeartbeat);

        expect(written.last['sessionStartedAt'], started);
        expect(written.last['clientTime'], now);
        s.dispose();
      });
    });

    test('reports when the app returns to the foreground', () {
      fakeAsync((async) {
        final s = service()..start();
        async.flushMicrotasks();

        // The states in between are required: a resume is only reported
        // when coming back through inactive.
        [
          AppLifecycleState.inactive,
          AppLifecycleState.hidden,
          AppLifecycleState.paused,
          AppLifecycleState.hidden,
          AppLifecycleState.inactive,
          AppLifecycleState.resumed,
        ].forEach(
          TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged,
        );
        async.flushMicrotasks();

        expect(written, hasLength(2));
        s.dispose();
      });
    });

    test('reports a pending update as soon as it is known', () async {
      SharedPreferences.setMockInitialValues({});
      final updates = UpdateService(
        currentBuildId: 'build-1',
        prefs: await SharedPreferences.getInstance(),
        remoteBuildIds: () => Stream.value('build-2'),
        fetchDeployedBuildId: () async => 'build-2',
        reloadPage: () {},
      );
      final s = service(updateService: updates)..start();
      updates.start();
      await pumpEventQueue();

      expect(written.last['updateTargetBuildId'], 'build-2');
      s.dispose();
      updates.dispose();
    });
  });
}
