STACK_NAME ?= ffmpeg-lambda-layer
PROFILE ?= knot-tomo

clean: 
	rm -rf build

.PHONY: build
build: 
	mkdir -p build/layer/bin
	rm -rf build/ffmpeg*
	cd build && curl https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -x
	mv build/ffmpeg*/ffmpeg build/ffmpeg*/ffprobe build/layer/bin
	cd build/layer && zip -r ffmpeg-layer.zip bin
	mv build/layer/ffmpeg-layer.zip .
upload:
	aws --profile $(PROFILE) s3 cp ffmpeg-layer.zip s3://daily-diary-storage-bucket/layers/ffmpeg-layer.zip