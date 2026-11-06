spec: docs/specs/file-ask-vision.md

## Revisions

I3. (r1) `meta.image` is `"attached"` when an image was sent, `"unavailable"` only when the route tried to send one and could not, and `"none"` otherwise, including when the profile cannot see; a `meta` event with no `image` key means `"none"`, and the notice line is shown for `"unavailable"` and never for the other two.
I11. (r1) A request body that carries a non-finite number is answered 422 on every route of the intelligence addon, never 500, and every other validation error body is unchanged.
I12. (r1) `has_vision_profile` answers as it did before this change for the picture-description path.
