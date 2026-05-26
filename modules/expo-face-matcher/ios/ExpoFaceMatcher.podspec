Pod::Spec.new do |s|
  s.name           = 'ExpoFaceMatcher'
  s.version        = '1.0.0'
  s.summary        = 'On-device face detection + embedding via Apple Vision'
  s.description    = 'Detects faces and computes Vision feature prints for similarity matching against a reference photo. Used by Our Little World to auto-surface baby photos in your library.'
  s.author         = 'Our Little World'
  s.homepage       = 'https://ourlittleworld.me'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
