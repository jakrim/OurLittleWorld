Pod::Spec.new do |s|
  s.name           = 'ExpoLetterTranscriber'
  s.version        = '1.0.0'
  s.summary        = 'Private on-device transcription for letter voice recordings'
  s.description    = 'Uses Apple Speech to turn a parent-approved local voice recording into editable letter text without uploading it for transcription.'
  s.author         = 'Our Little World'
  s.homepage       = 'https://ourlittleworld.me'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
