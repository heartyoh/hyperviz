# Hyperviz Modules: AI Assistant Development Guidelines

## My Development Checklist

### 1. Before Making Changes

- [ ] Understand the existing codebase
- [ ] Review related documentation
- [ ] Check current build status for both modules:
  ```bash
  yarn workspace @hyperviz/worker build
  yarn workspace @hyperviz/weather build
  ```
- [ ] Verify test status for both modules:
  ```bash
  yarn workspace @hyperviz/worker test
  yarn workspace @hyperviz/weather test
  ```

### 2. During Development

- [ ] Make incremental changes
- [ ] Follow TypeScript best practices
- [ ] Maintain type safety
- [ ] Keep backward compatibility
- [ ] Document changes clearly
- [ ] Consider cross-module dependencies
- [ ] Write all comments, documentation, examples, and code in English

### 3. After Changes

- [ ] Run main builds:
  ```bash
  yarn workspace @hyperviz/worker build
  yarn workspace @hyperviz/weather build
  ```
- [ ] Run example builds:
  ```bash
  yarn workspace @hyperviz/worker build:examples
  yarn workspace @hyperviz/weather build:examples
  ```
- [ ] Run tests:
  ```bash
  yarn workspace @hyperviz/worker test
  yarn workspace @hyperviz/weather test
  ```
- [ ] Document any new features or modifications
- [ ] Check cross-module compatibility

## Documentation Updates Workflow

### 1. Documentation Targets

- [ ] Root README.md
- [ ] Package READMEs:
  - [ ] `packages/worker/README.md`
  - [ ] `packages/weather/README.md`
  - [ ] Other package READMEs as added
- [ ] API Documentation (`docs/api.md`)
- [ ] Example Usage (`docs/examples.md`)
- [ ] Code comments (inline documentation)
- [ ] TypeScript definitions (type documentation)
- [ ] Roadmap and TODOs (`packages/worker/todo.txt`, etc.)
- [ ] Tutorial content (`docs/tutorials/`)
- [ ] Architecture overview (`docs/architecture.md`)

### 2. Documentation Principles

- **Current Implementation Status**: Ensure all documentation reflects the current implementation state of the codebase.
- **English Only**: All documentation must be written in English, including comments, examples, and READMEs.
- **Consistent Terminology**: Use consistent terminology across all documentation.
- **Code Examples**: Include up-to-date code examples for all key features.
- **API Completeness**: Document all public APIs, their parameters, return types, and exceptions.
- **Version Alignment**: Ensure documentation versions align with code versions.
- **Progressive Disclosure**: Organize documentation from basic to advanced topics.
- **Cross-References**: Include cross-references between related documentation.

### 3. Update Process

#### Regular Documentation Review

- [ ] Review documentation for accuracy at least once per sprint
- [ ] Compare code implementations with their documentation
- [ ] Verify examples still work with current API
- [ ] Check for outdated references or deprecated features
- [ ] Ensure new features are properly documented

#### Documentation Updates

- [ ] Update documentation immediately when implementing new features
- [ ] Mark deprecated features clearly in documentation
- [ ] Translate any non-English content to English
- [ ] Update diagrams and visual aids to match current architecture
- [ ] Validate all code samples by running them against current implementation
- [ ] Ensure consistent formatting across all documentation

#### Verification Steps

- [ ] Run automated documentation tests where available
- [ ] Verify links between documentation files
- [ ] Ensure API references match actual implementations
- [ ] Check for spelling and grammar issues
- [ ] Validate code examples with linting and execution tests

## Quality Standards

### 1. Code Quality

- Maintain strict type safety
- Follow existing patterns
- Write clear, maintainable code
- Keep related functionality together
- Use descriptive naming
- Ensure consistent patterns across modules

### 2. Error Handling

- Implement proper error handling
- Use appropriate error types
- Provide meaningful error messages
- Log errors appropriately
- Handle cross-module error propagation

### 3. Performance

- Monitor resource usage
- Optimize critical paths
- Handle edge cases
- Consider scalability
- Evaluate cross-module performance impact

## Problem Resolution

### 1. When Issues Arise

1. Verify build environment
2. Check dependencies (including cross-module)
3. Review recent changes
4. Test in isolation
5. Test cross-module interactions
6. Document findings

### 2. Common Issues

- Build failures
- Test timeouts
- Type errors
- Resource management issues
- Cross-module dependency issues
- Integration problems

### 3. Support Resources

- Review documentation
- Check issue tracker
- Consult team members
- Document solutions
- Consider module-specific solutions

## Continuous Improvement

### 1. Regular Checks

- Review and update practices
- Incorporate feedback
- Stay updated with dependencies
- Monitor technical debt
- Evaluate cross-module improvements

### 2. Documentation

- Keep documentation current
- Document API changes
- Maintain examples
- Update README as needed
- Document cross-module interactions

### 3. Code Review Focus

- Type safety
- Performance impact
- Error handling
- Documentation
- Test coverage
- Cross-module compatibility

## Development Best Practices

### 1. Code Structure Guidelines

- Always consider implementations in the /src/core folder
- Aim for simple, maintainable structures
- Keep code files under 500 lines when possible
- Avoid redundancy and similar functionality across the codebase
- Avoid duplicate or near-duplicate code
- Check compilation frequently after small changes

### 2. Type System Management

- Design centralized type definition systems
- Separate type files by module (core-types, imaging-types, offcanvas-types)
- Standardize naming conventions
- Progressively migrate existing types
- Update import statements in all core module files as needed

### 3. Code Health Maintenance

- Regularly refactor for clarity and maintainability
- Remove deprecated or unused code promptly
- Keep dependencies up to date
- Document architectural decisions
- Review and improve test coverage regularly
