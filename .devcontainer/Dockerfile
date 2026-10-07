FROM dart

RUN apt-get update \
    && apt-get install -y curl git unzip xz-utils zip libglu1-mesa \
    && apt-get clean

# Keep in step with environment.flutter in app/pubspec.yaml.
ARG FLUTTER_VERSION=3.47.6
RUN git clone https://github.com/flutter/flutter.git -b ${FLUTTER_VERSION} --depth 1 /flutter
ENV PATH="/flutter/bin:$PATH"
RUN flutter doctor
